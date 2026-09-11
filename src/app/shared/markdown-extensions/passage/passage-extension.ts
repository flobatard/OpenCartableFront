import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```passage : extrait à commenter, lignes numérotées dans la marge
 * (« l. 12 »), rendu par le template sans dépendance. Imprimable : du texte,
 * cloné tel quel par l'export PDF. Jamais d'import statique du composant.
 */
export const PASSAGE_EXTENSION: MarkdownExtensionDef = {
  language: 'passage',
  isPrintable: true,
  loadComponent: () => import('./passage-view').then((m) => m.PassageView),
  doc: { loadComponent: () => import('./passage-doc').then((m) => m.PassageDoc) },
};
