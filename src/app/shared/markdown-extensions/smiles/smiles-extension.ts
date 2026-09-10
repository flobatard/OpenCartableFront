import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```smiles : formules topologiques de molécules (notation SMILES)
 * dessinées en SVG par SmilesDrawer. Imprimable : le SVG est cloné tel quel
 * par l'export PDF. Jamais d'import statique du composant (bundle) — la lib
 * elle-même est importée dynamiquement par le composant (double lazy).
 */
export const SMILES_EXTENSION: MarkdownExtensionDef = {
  language: 'smiles',
  isPrintable: true,
  loadComponent: () => import('./smiles-view').then((m) => m.SmilesView),
  doc: { loadComponent: () => import('./smiles-doc').then((m) => m.SmilesDoc) },
};
