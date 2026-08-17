import { Component, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { COURSE_RESOURCE_RESOLVER } from '../../core/course-content/course-content-resolvers';
import { CourseResource } from '../../core/resources/resource.model';
import { formatBytes, isPdfResource } from '../../core/resources/resource.utils';

/**
 * Rendu d'un bloc `document` dans l'aperçu global du cours : média intégré
 * (image/audio/vidéo affichés en ligne via l'URL présignée du back), PDF
 * embarqué dans le viewer natif du navigateur (iframe, si `affichage` vaut
 * `inline`) et repli en carte téléchargeable pour les autres `document`, les
 * PDF en `telechargement` et en cas d'échec de présignature. Présentational —
 * n'a aucune logique d'onglet ni d'édition ; la ressource pointée lui est
 * passée résolue par l'hôte.
 *
 * Sécurité de l'iframe PDF : pas d'attribut `sandbox` — le viewer PDF de
 * Chrome ne se charge pas dans une iframe sandboxée ; l'isolation vient de
 * l'origine S3 (cross-origin) et du `Content-Type: application/pdf` signé au
 * PUT, qui interdit au navigateur d'y rendre du HTML.
 *
 * Navigateur uniquement : la résolution d'URL présignée touche le réseau et
 * `window` — la page hôte (onglet Aperçu) est en `RenderMode.Client`.
 */
@Component({
  selector: 'app-course-preview-document',
  imports: [TranslocoPipe],
  templateUrl: './course-preview-document.html',
  styleUrl: './course-preview-document.scss',
})
export class CoursePreviewDocument {
  readonly #resources = inject(COURSE_RESOURCE_RESOLVER);
  readonly #sanitizer = inject(DomSanitizer);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly courseId = input.required<string>();
  /** Ressource pointée, déjà résolue par le parent (`undefined` = supprimée/inconnue). */
  readonly resource = input<CourseResource | undefined>(undefined);
  readonly legende = input<string | null>(null);
  /** Mode d'affichage éditorial du bloc — ne pèse que sur les PDF :
      `telechargement` garde la carte au lieu de l'embed. */
  readonly affichage = input<'inline' | 'telechargement'>('inline');

  /** URL présignée du média intégré (TTL court, jamais stockée). `null` tant
      qu'elle n'est pas résolue ou si le bloc retombe sur la carte téléchargeable. */
  readonly #mediaUrl = signal<string | null>(null);
  protected readonly mediaUrl = this.#mediaUrl.asReadonly();

  /** URL présignée `inline` du PDF embarqué. `SafeResourceUrl` : un `[src]`
      d'iframe l'exige — le bypass est posé dans l'effect, sur une URL issue
      EXCLUSIVEMENT de `resolver.getDownloadUrl` (réponse de notre API), jamais
      d'une entrée utilisateur (précédent : geogebra-view, origine figée). */
  readonly #pdfUrl = signal<SafeResourceUrl | null>(null);
  protected readonly pdfUrl = this.#pdfUrl.asReadonly();

  /** Présignature échouée : on retombe sur la carte téléchargeable + message. */
  readonly #error = signal(false);
  protected readonly error = this.#error.asReadonly();

  protected readonly formatBytes = formatBytes;

  constructor() {
    // Résout l'URL présignée au montage : média intégré (image/audio/vidéo,
    // disposition par défaut) ou PDF embarqué (disposition `inline`). Les
    // autres `document` restent en carte téléchargeable, pas d'URL en avance.
    // Stale-guard : dans l'éditeur de bloc, ressource et affichage changent en
    // direct — une présignature périmée ne doit pas écraser la plus récente.
    effect((onCleanup) => {
      const resource = this.resource();
      const affichage = this.affichage();
      this.#mediaUrl.set(null);
      this.#pdfUrl.set(null);
      this.#error.set(false);
      if (!this.#isBrowser || !resource || resource.statut !== 'disponible') {
        return;
      }
      let stale = false;
      onCleanup(() => {
        stale = true;
      });
      const courseId = this.courseId();
      if (this.#isInlineType(resource.type)) {
        void this.#resources
          .getDownloadUrl(courseId, resource.id)
          .then((url) => {
            if (!stale) {
              this.#mediaUrl.set(url);
            }
          })
          .catch(() => {
            if (!stale) {
              this.#error.set(true);
            }
          });
        return;
      }
      if (this.#isPdf(resource) && affichage === 'inline') {
        void this.#resources
          .getDownloadUrl(courseId, resource.id, 'inline')
          .then((url) => {
            if (!stale) {
              this.#pdfUrl.set(this.#sanitizer.bypassSecurityTrustResourceUrl(url));
            }
          })
          .catch(() => {
            if (!stale) {
              this.#error.set(true);
            }
          });
      }
    });
  }

  /** Type affichable en ligne (le reste = PDF embarqué ou carte téléchargeable). */
  #isInlineType(type: CourseResource['type']): boolean {
    return type === 'image' || type === 'audio' || type === 'video';
  }

  /** PDF embarquable : un `document` au mime `application/pdf`. */
  #isPdf(resource: CourseResource): boolean {
    return resource.type === 'document' && isPdfResource(resource);
  }

  /** Vrai si le bloc doit s'afficher en média intégré (URL résolue, pas d'erreur). */
  protected showsMedia(): boolean {
    const resource = this.resource();
    return (
      !!resource && this.#isInlineType(resource.type) && this.mediaUrl() !== null && !this.error()
    );
  }

  /** Vrai si le bloc doit s'afficher en PDF embarqué (URL résolue, pas d'erreur). */
  protected showsPdf(): boolean {
    const resource = this.resource();
    return (
      !!resource &&
      this.#isPdf(resource) &&
      this.affichage() === 'inline' &&
      this.pdfUrl() !== null &&
      !this.error()
    );
  }

  /** Ouvre le PDF dans un nouvel onglet — URL `inline` FRAÎCHE (celle de
      l'iframe peut être proche de l'expiration, jamais réutilisée). */
  protected async openInTab(): Promise<void> {
    const resource = this.resource();
    if (!resource) {
      return;
    }
    try {
      const url = await this.#resources.getDownloadUrl(this.courseId(), resource.id, 'inline');
      window.open(url, '_blank', 'noopener');
    } catch {
      this.#error.set(true);
    }
  }

  /** Ouvre l'URL présignée dans un nouvel onglet (carte téléchargeable). */
  protected async download(): Promise<void> {
    const resource = this.resource();
    if (!resource) {
      return;
    }
    try {
      const url = await this.#resources.getDownloadUrl(this.courseId(), resource.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      this.#error.set(true);
    }
  }
}
