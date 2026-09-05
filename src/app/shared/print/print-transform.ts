import { AppLang } from '../../core/i18n/language.service';
import { MODULE_REF_ATTR } from '../../core/markdown/course-module-ref';
import { RESOURCE_REF_ATTR } from '../../core/markdown/course-resource-ref';
// Seule source de vérité des attributs posés par la passe placeholder des
// extensions (module pur sans Angular).
import {
  EXTENSION_ATTR,
  EXTENSION_PRINTABLE_ATTR,
} from '../markdown-extensions/extension-placeholders';
import { courseContentUrl, resourceContentUrl } from '../../core/resources/resource.utils';

/**
 * Transformations PURES (DOM en place, testées en jsdom) d'un clone de
 * contenu de cours avant impression — appelées par `PrintService`.
 */

/**
 * Constructeur d'URL front stable d'une ressource (liens embarqués dans les
 * PDF). La signature est celle de `resourceContentUrl` (défaut, régime prof) ;
 * le régime élève fournit la sienne (`PublicCourseService.contentUrl`).
 */
export type ResourceUrlBuilder = (
  lang: AppLang,
  courseId: string,
  resourceId: string,
) => string;

/** Libellés (déjà traduits) des notes de substitution papier. */
export interface PrintLabels {
  /** Préfixe de la note remplaçant un lecteur audio/vidéo. */
  mediaNote: string;
  /** Note remplaçant une extension markdown interactive non imprimable. */
  interactiveFallback: string;
  /** Préfixe de la note remplaçant un module interactif (suivi du lien cours). */
  moduleFallback: string;
}

/**
 * Transforme (en place) un clone de contenu de cours pour le papier. Deux
 * passes : les extensions markdown non imprimables (`data-oc-printable`
 * ≠ "true", ex. iframe GeoGebra) deviennent une note « contenu interactif » —
 * les imprimables (SVG JSXGraph) sont clonées telles quelles — ; puis la passe
 * keyée par `data-oc-resource-id` : les images restent (présigné valide à
 * l'instant → embarqué), l'audio/vidéo et l'iframe du PDF embarqué deviennent
 * une note renvoyant vers l'URL stable, les liens/boutons de ressource
 * pointent vers l'URL stable — la route front de redirection, construite dans
 * la langue active (`lang`).
 */
export function transformForPrint(
  root: HTMLElement,
  courseId: string | null,
  lang: AppLang,
  labels: PrintLabels,
  resourceUrl: ResourceUrlBuilder = resourceContentUrl,
): void {
  const doc = root.ownerDocument;
  for (const el of [...root.querySelectorAll(`[${EXTENSION_ATTR}]`)]) {
    if (el.getAttribute(EXTENSION_PRINTABLE_ATTR) !== 'true') {
      const note = doc.createElement('p');
      note.className = 'oc-print__extension-note';
      // textContent, jamais innerHTML : libellé traduit de confiance.
      note.textContent = labels.interactiveFallback;
      el.replaceWith(note);
    }
  }
  // Modules interactifs (iframe sandbox) : jamais imprimables. L'attribut est
  // porté à la fois par les embeds `oc-module:` du markdown et par l'hôte de
  // ModuleEmbed des blocs module de l'aperçu — une seule passe couvre les deux.
  // Note + lien vers la page du cours (URL stable) : le lecteur du PDF sait où
  // retrouver le contenu interactif.
  const courseUrl = courseId === null ? null : courseContentUrl(lang, courseId);
  for (const el of [...root.querySelectorAll(`[${MODULE_REF_ATTR}]`)]) {
    el.replaceWith(
      buildMediaNote(doc, labels.moduleFallback, '', courseUrl, 'oc-print__extension-note'),
    );
  }
  for (const el of [...root.querySelectorAll(`[${RESOURCE_REF_ATTR}]`)]) {
    const id = el.getAttribute(RESOURCE_REF_ATTR);
    const url = courseId && id ? resourceUrl(lang, courseId, id) : null;
    const tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      // Conservée : l'URL présignée est valide au moment de l'impression.
      continue;
    }
    if (tag === 'audio' || tag === 'video') {
      const label = el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? '';
      el.replaceWith(buildMediaNote(doc, labels.mediaNote, label, url));
      continue;
    }
    if (tag === 'iframe') {
      // PDF embarqué (bloc document) : pas d'équivalent papier — note + URL
      // stable, comme l'audio/vidéo. Sans cette branche l'iframe traverserait
      // le dispatch et sortirait en cadre vide dans le PDF exporté.
      const label = el.getAttribute('title') ?? '';
      el.replaceWith(buildMediaNote(doc, labels.mediaNote, label, url));
      continue;
    }
    if (tag === 'a') {
      // Lien déjà rendu : on remplace juste l'URL présignée par l'URL stable.
      if (url) {
        el.setAttribute('href', url);
      }
      continue;
    }
    if (tag === 'button' && url) {
      // Carte téléchargeable (bloc document, ressource non visionnable) : le
      // bouton est inutile sur papier.
      transformDocumentCard(el, url, doc);
    }
  }
}

/**
 * Rend imprimable la carte d'un bloc document : le nom du fichier devient un
 * lien cliquable (souligné) vers l'URL stable, et le bouton est remplacé par
 * l'URL en clair (copier-coller — utile si le PDF est imprimé sur papier). Repli
 * sur un simple lien copiable si la carte n'expose pas de nom.
 */
function transformDocumentCard(button: Element, url: string, doc: Document): void {
  const card = button.closest('.course-preview-document__card') ?? button.parentElement;
  const nameEl = card?.querySelector('.course-preview-document__name');
  if (nameEl) {
    const link = doc.createElement('a');
    link.className = 'oc-print__doc-name';
    link.setAttribute('href', url);
    link.textContent = nameEl.textContent?.trim() || url;
    nameEl.replaceChildren(link);

    const urlLine = doc.createElement('span');
    urlLine.className = 'oc-print__doc-url';
    urlLine.textContent = url;
    button.replaceWith(urlLine);
    return;
  }
  // Sans nom : au moins un lien copiable portant l'URL.
  const fallback = doc.createElement('a');
  fallback.className = 'oc-print__doc-url';
  fallback.setAttribute('href', url);
  fallback.textContent = url;
  button.replaceWith(fallback);
}

/** Nombre de blocs suivant un titre gardés avec lui (au-delà, coupure permise). */
const HEADING_KEEP_FOLLOWING = 3;

/** Vrai si l'élément est un titre h1–h6. */
function isHeadingEl(el: Element | null): boolean {
  return el !== null && /^H[1-6]$/.test(el.tagName);
}

/**
 * Évite les titres orphelins en bas de page : enveloppe chaque titre du contenu
 * de cours avec les quelques blocs qui le suivent dans un conteneur
 * `break-inside: avoid` — titre et contenu basculent alors ensemble sur la page
 * suivante plutôt que de laisser le titre seul en bas. Le regroupement est borné
 * (`HEADING_KEEP_FOLLOWING`) pour ne pas créer de gros blocs insécables qui
 * gaspilleraient l'espace ; un titre sans contenu à sa suite n'est pas enveloppé.
 */
export function keepHeadingsWithContent(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const content of [...root.querySelectorAll('.course-content')]) {
    let node: Element | null = content.firstElementChild;
    while (node !== null) {
      const next = node.nextElementSibling;
      if (!isHeadingEl(node) || next === null || isHeadingEl(next)) {
        node = next;
        continue;
      }
      // Titre suivi d'au moins un bloc : on les regroupe (jusqu'au cap ou au
      // prochain titre).
      const section = doc.createElement('div');
      section.className = 'oc-print__keep';
      node.replaceWith(section);
      section.appendChild(node);
      let following = section.nextElementSibling;
      let count = 0;
      while (following !== null && !isHeadingEl(following) && count < HEADING_KEEP_FOLLOWING) {
        const after = following.nextElementSibling;
        section.appendChild(following);
        following = after;
        count++;
      }
      node = section.nextElementSibling;
    }
  }
}

/**
 * Note remplaçant un contenu non imprimable (lecteur audio/vidéo, module
 * interactif) : préfixe traduit, libellé éventuel et lien vers l'URL stable.
 * Construite par API DOM (jamais innerHTML). Sans URL (hors contexte cours),
 * note textuelle simple.
 */
function buildMediaNote(
  doc: Document,
  prefix: string,
  label: string,
  url: string | null,
  className = 'oc-print__media-note',
): HTMLElement {
  const p = doc.createElement('p');
  p.className = className;
  const lead = [prefix, label].filter((s) => s !== '').join(' ');
  if (url === null) {
    p.textContent = lead;
    return p;
  }
  if (lead !== '') {
    p.append(doc.createTextNode(`${lead} `));
  }
  const link = doc.createElement('a');
  link.setAttribute('href', url);
  link.textContent = url;
  p.append(link);
  return p;
}
