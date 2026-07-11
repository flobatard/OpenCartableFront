import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```geogebra : intègre une activité GeoGebra publique par iframe.
 * Non imprimable (iframe interactive) : l'export PDF affiche la note
 * « contenu interactif ». Jamais d'import statique du composant (bundle).
 */
export const GEOGEBRA_EXTENSION: MarkdownExtensionDef = {
  language: 'geogebra',
  isPrintable: false,
  loadComponent: () => import('./geogebra-view').then((m) => m.GeogebraView),
};
