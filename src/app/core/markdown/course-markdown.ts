import DOMPurify from 'dompurify';
import katex from 'katex';
import { Marked, Tokens, TokenizerAndRendererExtension } from 'marked';

/**
 * Rendu du markdown des blocs de cours (contrat `texte` de
 * app/models/block.py) : markdown GFM + formules LaTeX — `$…$` en ligne,
 * `$$…$$` centrée — rendues par KaTeX.
 *
 * LA sanitisation du HTML de cours vit ici et nulle part ailleurs :
 * DOMPurify avec les profils html + mathMl + svg (la sortie KaTeX repose sur
 * des attributs `style` de positionnement, du MathML d'accessibilité et du
 * SVG pour les délimiteurs étirables — que le sanitizer d'Angular
 * dépouillerait). Les consommateurs injectent le résultat via
 * `bypassSecurityTrustHtml`, jamais de HTML non passé par cette fonction.
 *
 * ⚠ Navigateur uniquement : sans `window` (SSR), DOMPurify retourne le HTML
 * NON filtré — tout consommateur (aperçu éditeur, future vue élève) doit
 * n'injecter ce HTML que côté client (route RenderMode.Client ou rendu
 * différé après hydratation).
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

// Instance dédiée, configurée UNE fois au chargement du module : ne jamais
// muter le singleton `marked` (son use() est global). Défauts identiques
// (gfm actif) — le markdown sans formule se rend comme avant.
const courseMarked = new Marked({ extensions: [mathBlock, mathInline] });

/** Rend le markdown d'un bloc de cours en HTML sûr (cf. doc du module). */
export function renderCourseMarkdown(markdown: string): string {
  const html = courseMarked.parse(markdown, { async: false });
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    // KaTeX émet <semantics>/<annotation> (source LaTeX pour l'accessibilité),
    // strippés par le profil mathMl par défaut. Jamais annotation-xml (mXSS).
    ADD_TAGS: ['semantics', 'annotation'],
  });
}
