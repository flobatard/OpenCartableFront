import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { RESOURCE_REF_ATTR } from '../markdown/course-resource-ref';
import { resourceContentUrl } from '../resources/resource.utils';

/**
 * Export PDF d'un contenu de cours par **impression native** du navigateur
 * (« Enregistrer en PDF ») : zéro dépendance, maths KaTeX vectorielles et texte
 * sélectionnable. Le mécanisme est réutilisable — `markdown-view` (un bloc) et
 * `course-preview` (cours entier) l'appellent avec l'élément à imprimer.
 *
 * Marche : on clone le DOM rendu (déjà sanitisé par `course-markdown`), on le
 * transforme pour le papier (audio/vidéo retirés, liens ressources réécrits vers
 * l'URL API stable `/public` à la place des URL présignées éphémères), on le
 * pose dans un conteneur d'impression isolé (le stylesheet global `_print.scss`
 * masque le reste de l'app en `@media print`), puis `window.print()`.
 *
 * Navigateur uniquement (touche `window`/`document`) : no-op au SSR.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  readonly #transloco = inject(TranslocoService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Clone `source`, le prépare pour l'impression et déclenche le dialogue.
   * `courseId` sert à reconstruire les URL stables des ressources (`null` :
   * hors contexte cours — médias retirés, liens laissés tels quels).
   */
  async printCourseContent(source: HTMLElement, courseId: string | null): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    const clone = source.cloneNode(true) as HTMLElement;
    transformForPrint(clone, courseId, this.#transloco.translate('courses.preview.pdfMediaNote'));
    keepHeadingsWithContent(clone);

    const root = document.createElement('div');
    root.id = PRINT_ROOT_ID;
    root.appendChild(clone);
    document.body.appendChild(root);

    try {
      await waitForImages(root);
      // Chrome/Firefox modernes : print() bloque jusqu'à la fermeture du dialogue,
      // le retrait ci-dessous n'intervient donc qu'après le rendu.
      window.print();
    } finally {
      root.remove();
    }
  }
}

/** Id du conteneur d'impression (référencé par `_print.scss`). */
export const PRINT_ROOT_ID = 'oc-print-root';

/** Délai max d'attente d'une image avant impression (une image qui traîne ne bloque pas). */
const IMG_LOAD_TIMEOUT_MS = 3000;

/**
 * Transforme (en place) un clone de contenu de cours pour le papier. Passe
 * générique keyée par `data-oc-resource-id` : les images restent (présigné
 * valide à l'instant → embarqué), l'audio/vidéo devient une note renvoyant vers
 * l'URL stable, les liens/boutons de ressource pointent vers l'URL stable.
 * Exporté pour être testé isolément (jsdom).
 */
export function transformForPrint(
  root: HTMLElement,
  courseId: string | null,
  mediaNotePrefix: string,
): void {
  const doc = root.ownerDocument;
  for (const el of [...root.querySelectorAll(`[${RESOURCE_REF_ATTR}]`)]) {
    const id = el.getAttribute(RESOURCE_REF_ATTR);
    const url = courseId && id ? resourceContentUrl(courseId, id) : null;
    const tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      // Conservée : l'URL présignée est valide au moment de l'impression.
      continue;
    }
    if (tag === 'audio' || tag === 'video') {
      const label = el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? '';
      el.replaceWith(buildMediaNote(doc, mediaNotePrefix, label, url));
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
 * Exporté pour être testé isolément (jsdom).
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
 * Note remplaçant un lecteur audio/vidéo (non imprimable) : préfixe traduit,
 * libellé de la ressource et lien vers l'URL stable. Construite par API DOM
 * (jamais innerHTML). Sans URL (hors contexte cours), note textuelle simple.
 */
function buildMediaNote(
  doc: Document,
  prefix: string,
  label: string,
  url: string | null,
): HTMLElement {
  const p = doc.createElement('p');
  p.className = 'oc-print__media-note';
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

/** Attend le chargement des images du clone (bornée) : évite un PDF aux images blanches. */
function waitForImages(root: HTMLElement): Promise<unknown> {
  const images = [...root.querySelectorAll('img')];
  return Promise.all(images.map(imageReady));
}

/** Résout quand l'image est chargée/en erreur, ou au bout du timeout. */
function imageReady(img: HTMLImageElement): Promise<void> {
  if (img.complete) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    setTimeout(done, IMG_LOAD_TIMEOUT_MS);
  });
}
