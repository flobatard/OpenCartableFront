import { Component, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseResource } from '../../../core/resources/resource.model';
import { ResourceService } from '../../../core/resources/resource.service';
import { formatBytes } from '../../../core/resources/resource.utils';

/**
 * Rendu d'un bloc `document` dans l'aperçu global du cours : média intégré
 * (image/audio/vidéo affichés en ligne via l'URL présignée du back) et repli en
 * carte téléchargeable pour les PDF/autres (`type: 'document'`) et en cas
 * d'échec de présignature. Présentational — n'a aucune logique d'onglet ni
 * d'édition ; la ressource pointée lui est passée résolue par `course-preview`.
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
  readonly #resources = inject(ResourceService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly courseId = input.required<string>();
  /** Ressource pointée, déjà résolue par le parent (`undefined` = supprimée/inconnue). */
  readonly resource = input<CourseResource | undefined>(undefined);
  readonly legende = input<string | null>(null);

  /** URL présignée du média intégré (TTL court, jamais stockée). `null` tant
      qu'elle n'est pas résolue ou si le bloc retombe sur la carte téléchargeable. */
  readonly #mediaUrl = signal<string | null>(null);
  protected readonly mediaUrl = this.#mediaUrl.asReadonly();

  /** Présignature échouée : on retombe sur la carte téléchargeable + message. */
  readonly #error = signal(false);
  protected readonly error = this.#error.asReadonly();

  protected readonly formatBytes = formatBytes;

  constructor() {
    // Résout l'URL présignée du média intégré au montage, pour les ressources
    // disponibles dont le type s'affiche en ligne (image/audio/vidéo). Les
    // `document` (PDF/autres) restent en carte téléchargeable, pas d'URL en avance.
    effect(() => {
      const resource = this.resource();
      this.#mediaUrl.set(null);
      this.#error.set(false);
      if (!this.#isBrowser || !resource || resource.statut !== 'disponible') {
        return;
      }
      if (!this.#isInlineType(resource.type)) {
        return;
      }
      const courseId = this.courseId();
      void this.#resources
        .getDownloadUrl(courseId, resource.id)
        .then((url) => this.#mediaUrl.set(url))
        .catch(() => this.#error.set(true));
    });
  }

  /** Type affichable en ligne (le reste = carte téléchargeable). */
  #isInlineType(type: CourseResource['type']): boolean {
    return type === 'image' || type === 'audio' || type === 'video';
  }

  /** Vrai si le bloc doit s'afficher en média intégré (URL résolue, pas d'erreur). */
  protected showsMedia(): boolean {
    const resource = this.resource();
    return (
      !!resource && this.#isInlineType(resource.type) && this.mediaUrl() !== null && !this.error()
    );
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
