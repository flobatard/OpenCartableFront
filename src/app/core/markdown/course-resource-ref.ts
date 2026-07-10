import { CourseResource, ResourceType } from '../resources/resource.model';

/**
 * Référence stable d'une ressource de la bibliothèque dans le markdown de cours.
 *
 * On n'écrit JAMAIS l'URL présignée (TTL court, cf. `ResourceService`) dans le
 * markdown : on y stocke `oc-resource:<id>` — l'`id` de `CourseResource` —, que
 * le rendu résout en URL fraîche à l'affichage (`resolveCourseResources`,
 * `course-markdown.ts`). Ce module est le point unique du schéma, partagé par
 * l'insertion (helper de l'éditeur) et le rendu (override renderer de marked).
 */

/** Préfixe de href identifiant une référence de ressource. */
export const RESOURCE_REF_SCHEME = 'oc-resource:';

/** Attribut portant l'id sur le placeholder de rendu (survit à DOMPurify). */
export const RESOURCE_REF_ATTR = 'data-oc-resource-id';

/** Élément de rendu d'une ressource selon son type (audio/vidéo intégrés). */
export type ResourceRefKind = 'image' | 'audio' | 'video' | 'link';

/** Href de référence stable pour l'`id` d'une ressource (`oc-resource:<id>`). */
export function resourceRefHref(id: string): string {
  return `${RESOURCE_REF_SCHEME}${id}`;
}

/** Id de ressource extrait d'un href `oc-resource:<id>`, sinon `null`. */
export function parseResourceRef(href: string): string | null {
  if (!href.startsWith(RESOURCE_REF_SCHEME)) {
    return null;
  }
  const id = href.slice(RESOURCE_REF_SCHEME.length).trim();
  return id === '' ? null : id;
}

/**
 * Élément HTML à produire pour une ressource : images en ligne, audio/vidéo en
 * lecteurs intégrés, tout le reste (PDF, autres) en lien téléchargeable.
 */
export function resourceKind(type: ResourceType): ResourceRefKind {
  return type === 'image' || type === 'audio' || type === 'video' ? type : 'link';
}

/**
 * Snippet markdown insérant une ressource : image en syntaxe image
 * (`![nom](ref)`), tout le reste en lien (`[nom](ref)`) — le rendu choisira
 * l'élément final d'après le type réel de la ressource. Les `[`/`]` et sauts de
 * ligne du nom sont neutralisés pour ne pas casser la syntaxe.
 */
export function buildResourceMarkdown(
  resource: Pick<CourseResource, 'id' | 'nom_original' | 'type'>,
): string {
  const label = escapeLinkText(resource.nom_original);
  const ref = resourceRefHref(resource.id);
  return resource.type === 'image' ? `![${label}](${ref})` : `[${label}](${ref})`;
}

/** Échappe `[`/`]` et aplatit les retours ligne d'un libellé de lien markdown. */
function escapeLinkText(text: string): string {
  return text
    .replace(/[[\]]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}
