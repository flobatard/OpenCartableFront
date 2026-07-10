import { environment } from '../../../environments/environment';
import { ResourceType } from './resource.model';

/**
 * Helpers purs de la bibliothèque de ressources, testés isolément
 * (motif `subject.utils.ts`).
 */

/**
 * Base absolue de l'API : `apiUrl` s'il est déjà absolu (`http…`, cas dev où
 * l'API est sur un autre port), sinon préfixé par `siteUrl` (cas prod où
 * `apiUrl` est relatif `/api` — un PDF partagé exige une URL absolue).
 */
export function apiContentBase(apiUrl: string, siteUrl: string): string {
  return apiUrl.startsWith('http') ? apiUrl : `${siteUrl}${apiUrl}`;
}

/**
 * URL API **stable** de lecture d'une ressource (gateway `/content` : 307 vers
 * l'URL présignée inline S3). Contrairement à l'URL présignée (TTL court), elle
 * est pérenne — utilisable dans un PDF persistant. Toujours absolue.
 */
export function resourceContentUrl(courseId: string, resourceId: string): string {
  const base = apiContentBase(environment.apiUrl, environment.siteUrl);
  return `${base}/v1/courses/${courseId}/resources/${resourceId}/public`;
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
