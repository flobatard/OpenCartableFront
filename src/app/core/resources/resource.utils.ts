import { ResourceType } from './resource.model';

/**
 * Helpers purs de la bibliothèque de ressources, testés isolément
 * (motif `subject.utils.ts`).
 */

/**
 * Type de ressource déduit du MIME du fichier choisi : familles média
 * évidentes, tout le reste (PDF, zip, texte, inconnu…) est un `document`.
 */
export function resourceTypeFromMime(mime: string): ResourceType {
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  if (mime.startsWith('video/')) {
    return 'video';
  }
  return 'document';
}

/**
 * Taille lisible en unités décimales (o, ko, Mo, Go), une décimale au-delà
 * de l'octet. Formatage maison déterministe : pas d'`Intl` (dépendant de la
 * locale jsdom en spec), virgule décimale française comme le reste de l'UI.
 */
export function formatBytes(taille: number): string {
  if (taille < 1000) {
    return `${taille} o`;
  }
  const units = ['ko', 'Mo', 'Go'] as const;
  let value = taille;
  let unit: (typeof units)[number] = units[0];
  for (const candidate of units) {
    value = value / 1000;
    unit = candidate;
    if (value < 1000) {
      break;
    }
  }
  return `${value.toFixed(1).replace('.', ',')} ${unit}`;
}
