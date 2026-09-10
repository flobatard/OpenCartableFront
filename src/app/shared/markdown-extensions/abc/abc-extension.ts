import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```abc : partition en notation ABC, gravée en SVG et jouable au
 * piano par abcjs. Imprimable : la partition est clonée telle quelle par
 * l'export PDF (les contrôles de lecture sont masqués à l'impression).
 * Jamais d'import statique du composant (bundle) — abcjs elle-même est
 * importée dynamiquement par le composant (double lazy).
 */
export const ABC_EXTENSION: MarkdownExtensionDef = {
  language: 'abc',
  isPrintable: true,
  loadComponent: () => import('./abc-view').then((m) => m.AbcView),
  doc: { loadComponent: () => import('./abc-doc').then((m) => m.AbcDoc) },
};
