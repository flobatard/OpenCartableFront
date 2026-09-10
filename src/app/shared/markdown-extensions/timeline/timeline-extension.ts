import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```timeline : frise chronologique (périodes et événements) dessinée
 * en SVG par le template, sans dépendance. Imprimable : le SVG est cloné tel
 * quel par l'export PDF. Jamais d'import statique du composant (bundle).
 */
export const TIMELINE_EXTENSION: MarkdownExtensionDef = {
  language: 'timeline',
  isPrintable: true,
  loadComponent: () => import('./timeline-view').then((m) => m.TimelineView),
  doc: { loadComponent: () => import('./timeline-doc').then((m) => m.TimelineDoc) },
};
