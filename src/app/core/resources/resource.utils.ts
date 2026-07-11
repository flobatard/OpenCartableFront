import { environment } from '../../../environments/environment';
import { AppLang } from '../i18n/language.service';
import { ResourceType } from './resource.model';

/**
 * Helpers purs de la bibliothèque de ressources, testés isolément
 * (motif `subject.utils.ts`).
 */

/**
 * URL **front** stable de lecture d'une ressource : la route protégée OIDC
 * `/:lang/courses/:id/resources/:resourceId` (elle présigne via
 * `getDownloadUrl(..., 'inline')` puis redirige le navigateur vers S3).
 * Contrairement à l'URL présignée (TTL court), elle est pérenne — utilisable
 * dans un PDF persistant, mais réservée au prof propriétaire du cours tant
 * que le régime élève J2 (token de partage) n'existe pas. Toujours absolue
 * (`siteUrl`) : un PDF partagé l'exige.
 */
export function resourceContentUrl(
  lang: AppLang,
  courseId: string,
  resourceId: string,
): string {
  return `${environment.siteUrl}/${lang}/courses/${courseId}/resources/${resourceId}`;
}

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
