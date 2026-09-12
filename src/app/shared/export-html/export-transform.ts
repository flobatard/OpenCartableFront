import { AppLang } from '../../core/i18n/language.service';
import { RESOURCE_REF_ATTR } from '../../core/markdown/course-resource-ref';
import { resourceContentUrl } from '../../core/resources/resource.utils';
import {
  EXTENSION_ATTR,
  EXTENSION_PRINTABLE_ATTR,
} from '../markdown-extensions/extension-placeholders';
import { buildMediaNote, ResourceUrlBuilder } from '../print/print-transform';

/**
 * Transformations PURES (DOM en place, testées en jsdom) d'un clone de
 * contenu de cours avant sérialisation en page HTML autonome — appelées par
 * `ExportHtmlService`.
 *
 * Frère de `print-transform.ts`, dont elles reprennent les notes de
 * substitution (`buildMediaNote`) et le traitement des ressources, avec trois
 * différences dictées par la cible :
 *
 * - les **modules interactifs restent vivants** (iframe `srcdoc` inlinée par
 *   le service, passe asynchrone) au lieu de devenir une note ;
 * - les liens relatifs sont **absolutisés** : le fichier s'ouvre en `file://`,
 *   où une URL relative ne pointe plus sur rien ;
 * - la chrome morte (barres d'exécution, boutons flottants) est **retirée du
 *   DOM** plutôt que masquée en CSS — l'export n'emporte pas les règles
 *   `@media print` de l'app (cf. `export-styles.ts`).
 *
 * Ce qui reste identique au PDF : pas d'équivalent hors ligne pour l'audio, la
 * vidéo, un PDF embarqué ou une extension non imprimable (GeoGebra) — note +
 * lien vers l'URL front stable.
 */

/** Libellés (déjà traduits) des notes de substitution. */
export interface ExportLabels {
  /** Préfixe de la note remplaçant un lecteur audio/vidéo ou un PDF embarqué. */
  mediaNote: string;
  /** Note remplaçant une extension markdown qui exige le réseau. */
  interactiveFallback: string;
  /** Préfixe de la note remplaçant un module non embarqué (suivi du lien cours). */
  moduleFallback: string;
}

/**
 * Chrome retirée du clone : commandes qui n'ont plus de moteur derrière elles
 * dans un fichier isolé. **Miroir des blocs `@media print`** des mêmes
 * composants (`runnable-code.scss`, `python-view.scss`, `abc-view.scss`,
 * `course-blocks-view.scss`) et des règles de `_print.scss` — même liste,
 * même raison : les faire évoluer ensemble.
 */
export const EXPORT_STRIPPED_SELECTORS: readonly string[] = [
  // Boutons flottants de markdown-view (imprimer / style de lecture).
  '.markdown-view__actions',
  // Exécution de code : les runtimes WASM (sql.js, Pyodide) ne sont pas embarquables.
  '.runnable__toolbar',
  '.python-view__stdin',
  // Lecture audio d'une partition ABC : la banque de sons vit sur l'origine.
  '.abc-view__controls',
  '.abc-view__warnings',
  // Rangée « Ouvrir dans un onglet / Télécharger » d'un PDF embarqué (l'iframe
  // devient une note).
  '.course-preview-document__actions',
  // Contrôles du mode « résolution » d'un exercice : absents du clone (mode
  // preview), retirés par sécurité comme à l'impression.
  '.exercise-view__storage-warning',
  '.exercise-view__answer-label',
  '.exercise-view__question-actions',
  '.exercise-view__correction',
  '.exercise-view__footer',
];

/**
 * Prépare (en place) un clone de contenu de cours pour l'export autonome :
 * chrome morte retirée, extensions qui exigent le réseau remplacées par une
 * note, médias et liens de ressource keyés par `data-oc-resource-id`
 * réécrits vers l'URL front **stable** (la présignée expire), puis toutes les
 * URL relatives résolues en absolu.
 *
 * Les images ne sont PAS traitées ici : leur intégration en `data:` demande
 * un `fetch` (passe asynchrone du service).
 */
export function transformForExport(
  root: HTMLElement,
  courseId: string | null,
  lang: AppLang,
  labels: ExportLabels,
  resourceUrl: ResourceUrlBuilder = resourceContentUrl,
  siteUrl: string = '',
): void {
  const doc = root.ownerDocument;
  stripChrome(root);

  for (const el of [...root.querySelectorAll(`[${EXTENSION_ATTR}]`)]) {
    if (el.getAttribute(EXTENSION_PRINTABLE_ATTR) !== 'true') {
      const note = doc.createElement('p');
      note.className = 'oc-print__extension-note';
      // textContent, jamais innerHTML : libellé traduit de confiance.
      note.textContent = labels.interactiveFallback;
      el.replaceWith(note);
    }
  }

  for (const el of [...root.querySelectorAll(`[${RESOURCE_REF_ATTR}]`)]) {
    const id = el.getAttribute(RESOURCE_REF_ATTR);
    const url = courseId && id ? resourceUrl(lang, courseId, id) : null;
    const tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      continue; // Passe asynchrone : intégration en `data:` par le service.
    }
    if (tag === 'audio' || tag === 'video' || tag === 'iframe') {
      // Un média lourd ou un PDF n'entre pas dans le fichier : note + URL stable,
      // exactement comme au PDF.
      const label =
        el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.getAttribute('alt') ?? '';
      el.replaceWith(buildMediaNote(doc, labels.mediaNote, label, url));
      continue;
    }
    if (tag === 'a' && url) {
      el.setAttribute('href', url);
      continue;
    }
    if (tag === 'button' && url) {
      linkDocumentCard(el, url, doc);
    }
  }

  absolutizeUrls(root, siteUrl);
}

/** Retire du clone les commandes sans moteur (cf. `EXPORT_STRIPPED_SELECTORS`). */
export function stripChrome(root: HTMLElement): void {
  for (const el of [...root.querySelectorAll(EXPORT_STRIPPED_SELECTORS.join(','))]) {
    el.remove();
  }
}

/**
 * Remplace le bouton « Télécharger » de la carte d'un bloc document par un
 * **lien** vers l'URL stable : dans un fichier isolé, le bouton n'a plus de
 * composant Angular derrière lui, mais le lien reste vrai. (Le PDF, lui,
 * imprime l'URL en clair — un lecteur sur papier ne clique pas.)
 */
function linkDocumentCard(button: Element, url: string, doc: Document): void {
  const link = doc.createElement('a');
  link.className = button.className;
  link.setAttribute('href', url);
  link.setAttribute('rel', 'noopener');
  link.textContent = button.textContent?.trim() || url;
  button.replaceWith(link);
}

/** Schémas d'URL déjà autonomes : rien à résoudre. */
const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Résout les `href`/`src` relatifs contre l'URL du site. Le fichier exporté
 * s'ouvre en `file://` : sans cette passe, un lien de navigation rendu par le
 * routeur (`/fr/courses/…`, CTA « résoudre l'exercice ») pointerait vers la
 * racine du disque. Les ancres internes (`#id`), les `data:` et les URL déjà
 * absolues sont laissées telles quelles.
 */
export function absolutizeUrls(root: HTMLElement, siteUrl: string): void {
  if (siteUrl === '') {
    return;
  }
  const base = `${siteUrl.replace(/\/+$/, '')}/`;
  for (const el of [...root.querySelectorAll('[href], [src]')]) {
    for (const attr of ['href', 'src'] as const) {
      const value = el.getAttribute(attr);
      if (value === null || value === '' || ABSOLUTE_URL.test(value)) {
        continue;
      }
      try {
        el.setAttribute(attr, new URL(value, base).href);
      } catch {
        // URL inexploitable : laissée telle quelle plutôt que cassée.
      }
    }
  }
}
