/**
 * Configuration d'un fence ```tikz :
 * Contrairement à jsxgraph, il n'y a pas d'options metadata.
 * La totalité de la source est considérée comme le code LaTeX/TikZ.
 */

/** Parse la source et garantit la présence de l'environnement tikzpicture. */
export function parseTikzConfig(source: string): string {
  const code = source.trim();
  
  if (!code) {
    return '\\begin{tikzpicture}\n\\end{tikzpicture}';
  }

  // Ajoute l'environnement si le professeur a juste mis les commandes de dessin
  if (!code.includes('\\begin{tikzpicture}')) {
    return `\\begin{tikzpicture}\n${code}\n\\end{tikzpicture}`;
  }

  return code;
}