import { environment } from '../../../environments/environment';
import { AppLang } from '../i18n/language.service';
import { CourseResource, ResourceType } from './resource.model';

/**
 * Helpers purs de la bibliothèque de ressources, testés isolément
 * (comme `subject.utils.ts`).
 */

/**
 * URL **front** stable de la page d'un cours (`/:lang/courses/:id`), toujours
 * absolue (`siteUrl`) — destinée aux documents qui survivent à la session
 * (note « module interactif » du PDF). Même caveat que `resourceContentUrl` :
 * Route prof (protégée) : les pages élèves passent leur propre builder.
 */
export function courseContentUrl(lang: AppLang, courseId: string): string {
  return `${environment.siteUrl}/${lang}/courses/${courseId}`;
}

/**
 * URL **front** stable de lecture d'une ressource : la route protégée OIDC
 * `/:lang/courses/:id/resources/:resourceId` (elle présigne via
 * `getDownloadUrl(..., 'inline')` puis redirige le navigateur vers S3).
 * Contrairement à l'URL présignée (TTL court), elle est pérenne — utilisable
 * dans un PDF persistant. Route prof (protégée) : les pages élèves passent
 * à l'impression le builder de leur régime public. Toujours absolue
 * (`siteUrl`) : un PDF partagé l'exige.
 */
export function resourceContentUrl(
  lang: AppLang,
  courseId: string,
  resourceId: string,
): string {
  return `${courseContentUrl(lang, courseId)}/resources/${resourceId}`;
}

/**
 * PDF détecté par le `mime` déclaré au presign (`File.type` du navigateur,
 * exactement `application/pdf`) — pas de nouveau `ResourceType` : le PDF reste
 * un `document`, seul son affichage diffère (embarqué en ligne, bouton Voir).
 * Le shape `Pick` couvre aussi les `PublicResource` des pages élèves.
 */
export function isPdfResource(resource: Pick<CourseResource, 'mime'>): boolean {
  return resource.mime === 'application/pdf';
}

/**
 * Clé i18n du badge de type — les PDF ont leur badge dédié parmi les
 * `document` ; clé choisie par code, jamais interpolée depuis le mime.
 */
export function resourceTypeLabelKey(resource: Pick<CourseResource, 'type' | 'mime'>): string {
  return resource.type === 'document' && isPdfResource(resource)
    ? 'courses.resources.types.pdf'
    : `courses.resources.types.${resource.type}`;
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
export function formatBytes(size: number): string {
  if (size < 1000) {
    return `${size} o`;
  }
  const units = ['ko', 'Mo', 'Go'] as const;
  let value = size;
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
