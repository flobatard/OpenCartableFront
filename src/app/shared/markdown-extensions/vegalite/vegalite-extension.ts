import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```vegalite : graphique de données décrit par une spécification
 * Vega-Lite (JSON), rendu en SVG statique. Imprimable : le SVG est cloné tel
 * quel par l'export PDF. Jamais d'import statique du composant (bundle) — Vega
 * elle-même est importée dynamiquement par le composant (double lazy).
 */
export const VEGALITE_EXTENSION: MarkdownExtensionDef = {
  language: 'vegalite',
  isPrintable: true,
  loadComponent: () => import('./vegalite-view').then((m) => m.VegaliteView),
  doc: { loadComponent: () => import('./vegalite-doc').then((m) => m.VegaliteDoc) },
};
