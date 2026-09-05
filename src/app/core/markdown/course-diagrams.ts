import DOMPurify from 'dompurify';

/**
 * Diagrammes Mermaid — deuxième passe du rendu de cours, ASYNCHRONE et
 * navigateur uniquement (la première passe est `renderCourseMarkdown`).
 *
 * marked rend déjà un bloc ```mermaid en <pre><code class="language-mermaid">…
 * (repli gracieux : la source reste lisible tant que la passe n'a pas tourné).
 * `renderCourseDiagrams` remplace ces blocs par le SVG du diagramme. Le SVG
 * mermaid REPASSE par DOMPurify : la sanitisation du HTML de cours reste
 * confinée à `core/markdown/`.
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
 * sur une page sans diagramme ni au SSR (sans `window`, le HTML est renvoyé
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
 * `htmlLabels: false` pour la sanitisation (cf. doc du module). On se contente
 * de DÉTECTER un délimiteur math dans la source pour afficher un indice
 * pédagogique sous le diagramme (« mets la formule autour, pas dedans »).
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
 * Cf. doc du module pour les invariants de sanitisation.
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
