/**
 * Configuration d'un fence ```tikz :
 * Contrairement à jsxgraph, il n'y a pas d'options metadata.
 * La totalité de la source est considérée comme le code LaTeX/TikZ.
 */

/** Source d'un fence prête pour TikZJax. */
export interface TikzConfig {
  /** Code compilé entre `\begin{document}` et `\end{document}` (environnement garanti). */
  readonly code: string;
  /**
   * Bibliothèques des `\usetikzlibrary{…}` du fence, remontées au préambule
   * (attribut `data-tikz-libraries` du fork) : chargée dans le corps du
   * document, une bibliothèque émet des espaces parasites qui décalent la
   * figure dans son SVG (vérifié en navigateur).
   */
  readonly libraries: readonly string[];
}

const USE_LIBRARY = /\\usetikzlibrary\s*\{([^{}]*)\}/g;
/** Noms de bibliothèque seuls (`circuits.ee.IEC`, `arrows.meta`) : rien d'autre ne monte au préambule. */
const LIBRARY_LIST = /^[\w.\s,-]*$/;

/**
 * Parse la source : extrait les bibliothèques et garantit la présence de
 * l'environnement tikzpicture. Un `\usetikzlibrary` commenté (`%` plus tôt
 * sur sa ligne) ou aux arguments inattendus reste dans le code, tel quel.
 */
export function parseTikzConfig(source: string): TikzConfig {
  const libraries = new Set<string>();
  const code = source
    .replace(USE_LIBRARY, (match: string, names: string, offset: number, whole: string) => {
      const lineStart = whole.lastIndexOf('\n', offset - 1) + 1;
      if (whole.slice(lineStart, offset).includes('%') || !LIBRARY_LIST.test(names)) {
        return match;
      }
      for (const name of names.split(',')) {
        if (name.trim()) libraries.add(name.trim());
      }
      return '';
    })
    .trim();

  return { code: wrapInTikzpicture(code), libraries: [...libraries] };
}

function wrapInTikzpicture(code: string): string {
  if (!code) {
    return '\\begin{tikzpicture}\n\\end{tikzpicture}';
  }

  // Ajoute l'environnement si le professeur a juste mis les commandes de dessin
  if (!code.includes('\\begin{tikzpicture}')) {
    return `\\begin{tikzpicture}\n${code}\n\\end{tikzpicture}`;
  }

  return code;
}
