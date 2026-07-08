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

/*
 * Diagrammes Mermaid — deuxième passe, ASYNCHRONE et navigateur uniquement.
 *
 * marked rend déjà un bloc ```mermaid en <pre><code class="language-mermaid">…
 * (repli gracieux : la source reste lisible tant que la passe n'a pas tourné).
 * renderCourseDiagrams remplace ces blocs par le SVG du diagramme. Le SVG
 * mermaid REPASSE par DOMPurify : la sanitisation du HTML de cours reste
 * confinée à ce module, seul point de bypass autorisé.
 *
 * Deux contraintes de sanitisation vérifiées et non négociables :
 * - `htmlLabels: false` en TOP-LEVEL (pas sous `flowchart` — ignoré par le
 *   renderer v11) : les libellés doivent être des <text> SVG. En
 *   <foreignObject> (défaut mermaid), DOMPurify strippe TOUJOURS le HTML
 *   interne (même avec ADD_TAGS le foreignObject reste mais vide) et les
 *   diagrammes sortiraient sans texte. Vérifié : top-level → 0 foreignObject,
 *   libellés en <text> qui survivent à la sanitisation.
 * - `securityLevel: 'strict'` : défense en profondeur au-dessus de DOMPurify.
 *
 * mermaid est importé dynamiquement : hors du bundle initial, jamais chargé
 * sur une page sans diagramme ni au SSR (sans `window`, on renvoie le HTML
 * tel quel — le bloc source reste le repli). Un diagramme invalide n'interrompt
 * pas les autres : sa source est conservée dans un bloc d'erreur.
 */
const MERMAID_SOURCE_SELECTOR = 'pre > code.language-mermaid';

/** Ids DOM uniques pour mermaid.render (élément temporaire posé dans le body). */
let mermaidUid = 0;

/** Vrai si `html` (sortie de renderCourseMarkdown) contient un bloc mermaid. */
export function hasCourseDiagrams(html: string): boolean {
  return html.includes('language-mermaid');
}

/*
 * Le LaTeX dans les libellés Mermaid n'est PAS rendu ici : ça exigerait
 * `htmlLabels: true` (KaTeX injecté en <foreignObject>), or on force
 * `htmlLabels: false` pour la sanitisation (cf. doc ci-dessous). On se
 * contente de DÉTECTER un délimiteur math dans la source pour afficher un
 * indice pédagogique sous le diagramme (« mets la formule autour, pas dedans »).
 * Motif tolérant : un faux positif n'affiche qu'un indice non bloquant.
 */
const MERMAID_MATH_HINT = /\$[^$\n]+\$/;

/** Vrai si la source Mermaid contient un délimiteur math plausible (`$…$`/`$$…$$`). */
export function mermaidSourceHasMath(source: string): boolean {
  return MERMAID_MATH_HINT.test(source);
}

/**
 * Rend en SVG les blocs ```mermaid d'un HTML DÉJÀ sanitisé par
 * renderCourseMarkdown. `theme` aligne le thème mermaid sur celui de l'app.
 * Cf. doc ci-dessus pour les invariants de sanitisation.
 */
export async function renderCourseDiagrams(
  html: string,
  theme: 'light' | 'dark',
  mathNote?: string,
  errorLabel?: string,
): Promise<string> {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sources = doc.querySelectorAll(MERMAID_SOURCE_SELECTOR);
  if (sources.length === 0) {
    return html;
  }

  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
    // Libellés en <text> SVG (jamais <foreignObject>) : cf. doc du module.
    // TOP-LEVEL impératif — `flowchart.htmlLabels` est ignoré par le renderer.
    htmlLabels: false,
    // Diagramme invalide : ne PAS injecter le SVG « bombe » d'erreur de mermaid
    // dans le document. On gère notre propre repli (source visible) ci-dessous ;
    // sans ceci, mermaid pose son graphique d'erreur dans le document.body réel
    // (l'élément de travail temporaire orphelin), visible en bas de page.
    suppressErrorRendering: true,
  });

  // Séquentiel : mermaid.render mute un conteneur global partagé, deux appels
  // concurrents se marcheraient dessus.
  for (const code of sources) {
    const pre = code.parentElement;
    if (pre === null) {
      continue;
    }
    const source = code.textContent ?? '';
    const figure = doc.createElement('figure');
    const renderId = `oc-mermaid-${mermaidUid++}`;
    try {
      const { svg } = await mermaid.render(renderId, source);
      figure.className = 'course-mermaid';
      figure.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { html: true, svg: true, mathMl: true },
      });
      // Indice : le LaTeX dans un nœud Mermaid n'est pas rendu (htmlLabels:false).
      // textContent, jamais innerHTML : la note est un libellé traduit de confiance,
      // on ne rouvre pas de vecteur d'injection.
      if (mathNote !== undefined && mermaidSourceHasMath(source)) {
        const note = doc.createElement('figcaption');
        note.className = 'course-mermaid__note';
        note.textContent = mathNote;
        figure.appendChild(note);
      }
    } catch (err) {
      // Diagramme invalide : on garde la source visible (comme .katex-error) et
      // on affiche le message d'erreur de mermaid en légende pour guider l'auteur.
      figure.className = 'course-mermaid course-mermaid--error';
      if (errorLabel !== undefined) {
        const caption = doc.createElement('figcaption');
        caption.className = 'course-mermaid__error';
        // textContent, jamais innerHTML : le message d'erreur mermaid est du
        // texte non fiable (dérivé de la source), on ne rouvre pas d'injection.
        const detail = err instanceof Error ? err.message.trim() : '';
        caption.textContent = detail ? `${errorLabel} ${detail}` : errorLabel;
        figure.appendChild(caption);
      }
      const fallback = doc.createElement('pre');
      fallback.textContent = source;
      figure.appendChild(fallback);
      // Défense en profondeur : mermaid crée son élément de travail dans le
      // document.body RÉEL (pas notre `doc` détaché) et ne le nettoie pas en
      // cas d'échec. On retire cet orphelin (`d<id>`) pour éviter tout résidu.
      document.querySelector(`#d${renderId}`)?.remove();
    }
    pre.replaceWith(figure);
  }

  return doc.body.innerHTML;
}
