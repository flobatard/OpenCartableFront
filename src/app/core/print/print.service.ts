import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../i18n/language.service';
import { resourceContentUrl } from '../resources/resource.utils';
import {
  keepHeadingsWithContent,
  ResourceUrlBuilder,
  transformForPrint,
} from './print-transform';

export {
  keepHeadingsWithContent,
  transformForPrint,
  type PrintLabels,
  type ResourceUrlBuilder,
} from './print-transform';

/** Id du conteneur d'impression (référencé par `_print.scss`). */
export const PRINT_ROOT_ID = 'oc-print-root';

/** Délai max d'attente d'une image avant impression (une image qui traîne ne bloque pas). */
const IMG_LOAD_TIMEOUT_MS = 3000;

/**
 * Export PDF d'un contenu de cours par **impression native** du navigateur
 * (« Enregistrer en PDF ») : zéro dépendance, maths KaTeX vectorielles et texte
 * sélectionnable. Le mécanisme est réutilisable — `markdown-view` (un bloc),
 * `course-preview` et `student-content` (cours entier) l'appellent avec
 * l'élément à imprimer.
 *
 * Marche : on clone le DOM rendu (déjà sanitisé par `core/markdown/`), on le
 * transforme pour le papier (`print-transform.ts` : médias remplacés par des
 * notes, liens ressources réécrits vers l'URL front stable à la place des URL
 * présignées éphémères), on le pose dans un conteneur d'impression isolé (le
 * stylesheet global `_print.scss` masque le reste de l'app en `@media print`),
 * puis `window.print()`.
 *
 * Navigateur uniquement (touche `window`/`document`) : no-op au SSR.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  readonly #transloco = inject(TranslocoService);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Clone `source`, le prépare pour l'impression et déclenche le dialogue.
   * `courseId` sert à reconstruire les URL stables des ressources (`null` :
   * hors contexte cours — médias retirés, liens laissés tels quels).
   * `resourceUrl` (optionnel) construit ces URL stables — défaut : la route
   * prof protégée (`resourceContentUrl`) ; les pages élèves passent le builder
   * de leur régime public pour que les liens des PDF partagés n'exigent jamais
   * de login.
   */
  async printCourseContent(
    source: HTMLElement,
    courseId: string | null,
    resourceUrl: ResourceUrlBuilder = resourceContentUrl,
  ): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    const clone = source.cloneNode(true) as HTMLElement;
    transformForPrint(
      clone,
      courseId,
      this.#language.lang(),
      {
        mediaNote: this.#transloco.translate('courses.preview.pdfMediaNote'),
        interactiveFallback: this.#transloco.translate('markdownExtensions.printFallback'),
        moduleFallback: this.#transloco.translate('moduleEmbed.printFallback'),
      },
      resourceUrl,
    );
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
