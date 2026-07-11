import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```jsxgraph : figure mathématique (courbes, points) tracée par
 * JSXGraph en SVG. Imprimable : le SVG rendu est cloné tel quel par l'export
 * PDF. Jamais d'import statique du composant (bundle) — la lib jsxgraph
 * elle-même est importée dynamiquement par le composant (double lazy).
 */
export const JSXGRAPH_EXTENSION: MarkdownExtensionDef = {
  language: 'jsxgraph',
  isPrintable: true,
  loadComponent: () => import('./jsxgraph-view').then((m) => m.JsxgraphView),
  doc: { loadComponent: () => import('./jsxgraph-doc').then((m) => m.JsxgraphDoc) },
};
