import DOMPurify from 'dompurify';
import katex from 'katex';
// Side-effect : enregistre `\ce` et `\pu` (chimie, unités) sur la MÊME
// instance que `katex` (le module importe `../katex.mjs`).
import 'katex/contrib/mhchem';
import { Marked, Parser, Renderer, Tokens, TokenizerAndRendererExtension } from 'marked';
import { BLOCK_REF_ATTR, parseBlockRef } from './course-block-ref';
import {
  CALLOUT_FALLBACK_TITLES,
  CalloutParts,
  CalloutTitles,
  splitCallout,
} from './course-callouts';
import { MODULE_REF_ATTR, parseModuleRef } from './course-module-ref';
import { parseResourceRef, RESOURCE_REF_ATTR } from './course-resource-ref';

// Passes suivantes du pipeline, réexportées ici (point d'entrée du pipeline).
export { hasCourseDiagrams, mermaidSourceHasMath, renderCourseDiagrams } from './course-diagrams';
export {
  hasCourseModules,
  hasCourseResources,
  resolveCourseResources,
} from './course-resource-pass';
export type { ResolvedResource } from './course-resource-pass';

/**
 * Rendu du markdown des blocs de cours (contrat `texte` de
 * app/models/block.py) : markdown GFM + formules LaTeX — `$…$` en ligne,
 * `$$…$$` centrée — rendues par KaTeX, extension mhchem comprise (`\ce{…}`,
 * `\pu{…}`) + encadrés `> [!DEFINITION]…` (`course-callouts.ts`). Première
 * passe, synchrone ; les diagrammes Mermaid (`course-diagrams.ts`) et les
 * ressources de la bibliothèque (`course-resource-pass.ts`) sont des passes
 * asynchrones enchaînées par `markdown-view`.
 *
 * LA sanitisation du HTML de cours vit dans `core/markdown/` et nulle part
 * ailleurs : DOMPurify avec les profils html + mathMl + svg (la sortie KaTeX
 * repose sur des attributs `style` de positionnement, du MathML
 * d'accessibilité et du SVG pour les délimiteurs étirables — que le sanitizer
 * d'Angular dépouillerait). Les consommateurs injectent le résultat via
 * `bypassSecurityTrustHtml`, jamais de HTML non passé par cette fonction.
 *
 * ⚠ Navigateur uniquement : sans `window` (SSR), DOMPurify retourne le HTML
 * NON filtré — tout consommateur n'injecte ce HTML que côté client (route
 * RenderMode.Client ou rendu différé après hydratation).
 */

/**
 * Token math produit par nos tokenizers. `Tokens.Generic` porte une
 * signature d'index : les propriétés déclarées ici évitent les accès
 * `token['text']` imposés par noPropertyAccessFromIndexSignature.
 */
interface MathToken extends Tokens.Generic {
  type: 'mathBlock' | 'mathInline';
  raw: string;
  text: string;
  displayMode: boolean;
}

/*
 * Règles de délimitation pragmatiques (inspirées de Pandoc et de
 * marked-katex-extension, sans viser l'exhaustivité) :
 * - BLOCK  : `$$…$$` dont la fermeture tombe en fin de ligne ; contenu
 *   multiligne autorisé mais sans `$$` ; contenu blanc = pas une formule.
 * - INLINE : `$…$` (ou `$$…$$` centré) dans le fil du texte ; pas d'espace
 *   après l'ouvrant ni avant le fermant, fermant non suivi d'un chiffre
 *   (« 10$ et 20$ » reste du texte), contenu sur une seule ligne.
 * - `\$` : hors formule, le tokenizer `escape` natif de marked rend un `$`
 *   littéral ; dans une formule, la paire `\\.` du motif le préserve.
 */
const BLOCK_RULE = /^\$\$((?:[^$]|\$(?!\$))+?)\$\$[ \t]*(?:\n|$)/;
const INLINE_RULE = /^(\$\$?)(?!\s)((?:\\.|[^\\\n$])*?(?:\\.|[^\\\n$\s]))\1(?!\d)/;
const BLOCK_START = /(?:^|\n)\$\$/;

/** LaTeX invalide : jamais d'exception — KaTeX rend le source en `.katex-error`. */
function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  // Hint ancré en début de ligne ET prévalidé : un hint naïf (indexOf('$$'))
  // couperait les paragraphes contenant un `$$…$$` en ligne (cf. spec).
  start(src: string): number | undefined {
    let from = 0;
    let match: RegExpExecArray | null;
    while ((match = BLOCK_START.exec(src.slice(from))) !== null) {
      const at = from + match.index + match[0].length - 2;
      if (BLOCK_RULE.test(src.slice(at))) {
        return at;
      }
      from = at + 2;
    }
    return undefined;
  },
  tokenizer(src: string): MathToken | undefined {
    const match = BLOCK_RULE.exec(src);
    if (match === null || match[1].trim() === '') {
      return undefined;
    }
    return { type: 'mathBlock', raw: match[0], text: match[1].trim(), displayMode: true };
  },
  renderer: (token) => renderTex((token as MathToken).text, true),
};

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: (src: string) => src.match(/\$/)?.index,
  tokenizer(src: string): MathToken | undefined {
    const match = INLINE_RULE.exec(src);
    if (match === null) {
      return undefined;
    }
    return {
      type: 'mathInline',
      raw: match[0],
      text: match[2],
      displayMode: match[1] === '$$',
    };
  },
  renderer: (token) => {
    const mathToken = token as MathToken;
    return renderTex(mathToken.text, mathToken.displayMode);
  },
};

/** Échappe un texte destiné à une valeur d'attribut HTML (id, alt). */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Attributs du placeholder de ressource (l'id survit à DOMPurify via `data-*`). */
function resourcePlaceholderAttrs(id: string): string {
  return ` ${RESOURCE_REF_ATTR}="${escapeHtmlAttr(id)}" class="course-resource course-resource--pending"`;
}

/**
 * Placeholder d'un module interactif (`oc-module:<id>`) : un `<span>` inerte
 * portant l'id en `data-*` (survit à DOMPurify) et le texte du lien en repli
 * lisible ; `markdown-view` y monte dynamiquement un `ModuleEmbed` (hors
 * contexte cours, le span reste une note inerte). Pas de passe async ici :
 * le montage est un composant, pas une substitution HTML.
 */
function modulePlaceholder(id: string, label: string): string {
  return (
    `<span ${MODULE_REF_ATTR}="${escapeHtmlAttr(id)}"` +
    ` class="course-module-embed course-module-embed--pending">${label}</span>`
  );
}

/**
 * Ancre inerte d'une citation de bloc (`oc-block:<id>`, assistant IA) : pas
 * de href (rien à résoudre), l'id voyage en `data-*` (survit à DOMPurify) et
 * `tabindex` la rend focusable — les hôtes qui naviguent le font par
 * délégation d'événements (directive `ocBlockCitations`) ; partout ailleurs
 * l'ancre reste un texte inerte.
 */
function blockRefAnchor(id: string, label: string): string {
  return (
    `<a ${BLOCK_REF_ATTR}="${escapeHtmlAttr(id)}" class="course-block-ref"` +
    ` role="link" tabindex="0">${label}</a>`
  );
}

/**
 * Titres par défaut des encadrés du rendu EN COURS : posés par
 * `renderCourseMarkdown` autour de son `parse`, synchrone — aucun autre rendu
 * ne peut s'intercaler.
 */
let activeCalloutTitles: CalloutTitles = CALLOUT_FALLBACK_TITLES;

/**
 * Encadré (cf. course-callouts.ts) : `<div>` classé par type, titre en `<p>`
 * — titre par défaut du type, ou titre personnalisé précédé de ce titre en
 * `.sr-only` : le type n'est jamais porté par la seule couleur (l'icône du
 * titre, en CSS, le double pour l'œil).
 */
function calloutHtml(parser: Parser, callout: CalloutParts): string {
  const label = escapeHtmlAttr(activeCalloutTitles[callout.kind]);
  const title =
    callout.titleTokens.length === 0
      ? label
      : `<span class="sr-only">${label} : </span>${parser.parseInline(callout.titleTokens)}`;
  return (
    `<div class="course-callout course-callout--${callout.kind}">\n` +
    `<p class="course-callout__title">${title}</p>\n` +
    `${parser.parse(callout.bodyTokens)}</div>\n`
  );
}

// Instance dédiée, configurée UNE fois au chargement du module : ne jamais
// muter le singleton `marked` (son use() est global). Défauts identiques
// (gfm actif) — le markdown sans formule se rend comme avant.
//
// Override des renderers image/link : un href `oc-resource:<id>` (bibliothèque
// du cours) devient un placeholder `data-oc-resource-id` SANS src/href (aucune
// requête réseau ; l'URL présignée est résolue au rendu par
// resolveCourseResources) ; tout autre href retombe sur le rendu marked par
// défaut (`return false`). L'élément final (image/audio/vidéo/lien) est choisi
// par la passe de résolution selon le type réel de la ressource.
//
// Override du renderer blockquote : une citation ouverte par un marqueur
// `[!TYPE]` connu devient un encadré, toute autre citation garde le rendu
// par défaut.
//
// Override du renderer table : le tableau (rendu par défaut, sémantique
// intacte) est enveloppé d'un conteneur `.course-table` qui défile
// horizontalement — un tableau large ne peut pas élargir la page (téléphone).
const courseMarked = new Marked({
  extensions: [mathBlock, mathInline],
  renderer: {
    table(token) {
      return `<div class="course-table">${Renderer.prototype.table.call(this, token)}</div>`;
    },
    blockquote({ tokens }) {
      const callout = splitCallout(tokens);
      return callout === null ? false : calloutHtml(this.parser, callout);
    },
    image({ href, text }) {
      // `![…](oc-module:…)` : symétrie naturelle avec `![…](oc-resource:…)` —
      // même placeholder d'embed que le lien (sans lui, marked émettrait un
      // <img src="oc-module:…"> que DOMPurify vide : perte silencieuse).
      const moduleId = parseModuleRef(href);
      if (moduleId !== null) {
        return modulePlaceholder(moduleId, escapeHtmlAttr(text));
      }
      // `![…](oc-block:…)` n'a pas de sens image, mais un modèle IA peut
      // l'émettre : même ancre que le lien plutôt qu'une <img> vidée.
      const blockId = parseBlockRef(href);
      if (blockId !== null) {
        return blockRefAnchor(blockId, escapeHtmlAttr(text));
      }
      const id = parseResourceRef(href);
      return id === null
        ? false
        : `<img${resourcePlaceholderAttrs(id)} alt="${escapeHtmlAttr(text)}">`;
    },
    link({ href, tokens }) {
      // `oc-module:` d'abord (schéma disjoint de `oc-resource:`) : le
      // placeholder est un span monté en composant par markdown-view.
      const moduleId = parseModuleRef(href);
      if (moduleId !== null) {
        return modulePlaceholder(moduleId, this.parser.parseInline(tokens));
      }
      // `oc-block:` (citations de l'assistant IA) : ancre inerte data-*.
      const blockId = parseBlockRef(href);
      if (blockId !== null) {
        return blockRefAnchor(blockId, this.parser.parseInline(tokens));
      }
      const id = parseResourceRef(href);
      return id === null
        ? false
        : `<a${resourcePlaceholderAttrs(id)}>${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

/** Options du rendu : ce qui dépend de la langue de l'interface. */
export interface CourseMarkdownOptions {
  /** Titres par défaut des encadrés (repli : `CALLOUT_FALLBACK_TITLES`). */
  readonly calloutTitles?: CalloutTitles;
}

/** Rend le markdown d'un bloc de cours en HTML sûr (cf. doc du module). */
export function renderCourseMarkdown(
  markdown: string,
  options: CourseMarkdownOptions = {},
): string {
  activeCalloutTitles = options.calloutTitles ?? CALLOUT_FALLBACK_TITLES;
  let html: string;
  try {
    html = courseMarked.parse(markdown, { async: false });
  } finally {
    activeCalloutTitles = CALLOUT_FALLBACK_TITLES;
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    // KaTeX émet <semantics>/<annotation> (source LaTeX pour l'accessibilité),
    // strippés par le profil mathMl par défaut. Jamais annotation-xml (mXSS).
    ADD_TAGS: ['semantics', 'annotation'],
  });
}
