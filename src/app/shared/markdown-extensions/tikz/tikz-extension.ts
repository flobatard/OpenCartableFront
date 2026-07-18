import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Définition de l'extension TikZ.
 * Permet le rendu de géométrie et graphes via LaTeX.
 * Le SVG généré est statique, il est donc imprimable nativement.
 */
export const TIKZ_EXTENSION: MarkdownExtensionDef = {
  language: 'tikz',
  isPrintable: true, 
  loadComponent: () => import('./tikz-view').then((m) => m.TikzView),
  doc: {
    loadComponent: () => import('./tikz-doc').then((m) => m.TikzDoc),
  },
};