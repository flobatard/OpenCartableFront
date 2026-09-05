import DOMPurify from 'dompurify';
import { MODULE_REF_ATTR } from './course-module-ref';
import { ResourceRefKind, RESOURCE_REF_ATTR } from './course-resource-ref';

/**
 * Ressources de la bibliothèque intégrées au markdown — troisième passe du
 * rendu de cours, ASYNCHRONE et navigateur uniquement (patron de
 * `renderCourseDiagrams`).
 *
 * `renderCourseMarkdown` émet un placeholder `data-oc-resource-id` (sans
 * src/href, donc aucune requête réseau) pour chaque `oc-resource:<id>`. Cette
 * passe le remplace par le média (image/audio/vidéo intégré) ou le lien
 * téléchargeable, l'URL présignée (TTL court, jamais stockée) étant résolue à
 * la volée par `resolve`. Une ressource supprimée / indisponible / injoignable
 * (`resolve` renvoie `null`) devient une note « indisponible ». Le HTML
 * REPASSE par DOMPurify : la sanitisation du HTML de cours reste confinée à
 * `core/markdown/`.
 */

/** URL présignée + élément de rendu + libellé d'une ressource résolue. */
export interface ResolvedResource {
  url: string;
  kind: ResourceRefKind;
  label: string;
}

/** Vrai si `html` (sortie de renderCourseMarkdown) référence une ressource. */
export function hasCourseResources(html: string): boolean {
  return html.includes(RESOURCE_REF_ATTR);
}

/** Vrai si `html` (sortie de renderCourseMarkdown) référence un module. */
export function hasCourseModules(html: string): boolean {
  return html.includes(MODULE_REF_ATTR);
}

/**
 * Remplace les placeholders `data-oc-resource-id` d'un HTML DÉJÀ sanitisé par le
 * média/lien correspondant. `resolve` mappe un id → { url, kind, label } (ou
 * `null` si indisponible) ; `missingLabel` est la note affichée à sa place.
 */
export async function resolveCourseResources(
  html: string,
  resolve: (id: string) => Promise<ResolvedResource | null>,
  missingLabel: string,
): Promise<string> {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nodes = doc.querySelectorAll(`[${RESOURCE_REF_ATTR}]`);
  if (nodes.length === 0) {
    return html;
  }

  // Une présignature par id distinct, même s'il est référencé plusieurs fois.
  const ids = [...new Set([...nodes].map((n) => n.getAttribute(RESOURCE_REF_ATTR) ?? ''))].filter(
    (id) => id !== '',
  );
  const resolved = new Map<string, ResolvedResource | null>();
  await Promise.all(
    ids.map(async (id) => {
      resolved.set(id, await resolve(id).catch(() => null));
    }),
  );

  for (const node of nodes) {
    const id = node.getAttribute(RESOURCE_REF_ATTR) ?? '';
    node.replaceWith(buildResourceElement(doc, resolved.get(id) ?? null, missingLabel, id));
  }

  return DOMPurify.sanitize(doc.body.innerHTML, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    // target/aria-label ne sont pas dans la liste par défaut de DOMPurify
    // (controls/loading/download/src/href/alt/class, eux, le sont).
    ADD_ATTR: ['target', 'aria-label'],
  });
}

/**
 * Élément DOM d'une ressource résolue (jamais innerHTML : pas de réinjection).
 * L'`id` de la ressource est reposé en `data-oc-resource-id` sur l'élément
 * résolu (inerte à l'écran, survit à DOMPurify via `data-*`) : il permet à un
 * consommateur (ex. l'export PDF) de retrouver la ressource et de reconstruire
 * une URL stable à la place de l'URL présignée éphémère.
 */
function buildResourceElement(
  doc: Document,
  resolved: ResolvedResource | null,
  missingLabel: string,
  id: string,
): HTMLElement {
  if (resolved === null) {
    const span = doc.createElement('span');
    span.className = 'course-resource course-resource--missing';
    span.textContent = missingLabel;
    return span;
  }
  const { url, kind, label } = resolved;
  if (kind === 'image') {
    const img = doc.createElement('img');
    img.className = 'course-resource';
    img.setAttribute(RESOURCE_REF_ATTR, id);
    img.setAttribute('src', url);
    img.setAttribute('alt', label);
    img.setAttribute('loading', 'lazy');
    return img;
  }
  if (kind === 'audio' || kind === 'video') {
    const media = doc.createElement(kind);
    media.className = 'course-resource';
    media.setAttribute(RESOURCE_REF_ATTR, id);
    media.setAttribute('controls', '');
    media.setAttribute('src', url);
    media.setAttribute('aria-label', label);
    return media;
  }
  const link = doc.createElement('a');
  link.className = 'course-resource course-resource--link';
  link.setAttribute(RESOURCE_REF_ATTR, id);
  link.setAttribute('href', url);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener');
  link.textContent = label;
  return link;
}
