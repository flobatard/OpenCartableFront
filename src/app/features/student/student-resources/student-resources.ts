import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { COURSE_RESOURCE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { CourseResource } from '../../../core/resources/resource.model';
import {
  formatBytes,
  isPdfResource,
  resourceTypeLabelKey,
} from '../../../core/resources/resource.utils';
import { ResourcePreviewDialog } from '../../../shared/resource-preview-dialog/resource-preview-dialog';

/**
 * Onglet « Ressources » de la vue élève (route `resources`) — bibliothèque de
 * fichiers du cours en **lecture seule**. Pendant public de `CourseResources`
 * (onglet prof) dont il reprend la grammaire visuelle (badge de type, nom,
 * taille, actions) mais pas les mutations : ni upload, ni renommage, ni
 * suppression.
 *
 * Aucune requête de liste : les ressources sont embarquées dans le détail
 * public déjà chargé par la coquille, et exposées par le résolveur. Les deux
 * accès réseau (présignature, aperçu) passent par `COURSE_RESOURCE_RESOLVER`,
 * donc par l'implémentation **publique** fournie par la route : aucun Bearer
 * n'est attaché sous `/v1/public/`.
 *
 * Client-only (présignature, modale d'aperçu).
 */
@Component({
  selector: 'app-student-resources',
  imports: [TranslocoPipe, ResourcePreviewDialog],
  templateUrl: './student-resources.html',
  styleUrl: './student-resources.scss',
})
export class StudentResources {
  readonly #courses = inject(PublicCourseService);
  readonly #resolver = inject(COURSE_RESOURCE_RESOLVER);

  protected readonly courseId = computed(() => this.#courses.detail()?.id ?? '');
  /** Ressources du cours, déjà triées par le back (toutes `available`). */
  protected readonly resources = this.#resolver.list;

  protected readonly previewDialog = viewChild(ResourcePreviewDialog);

  /** Téléchargement en vol : fige les boutons le temps de la présignature. */
  protected readonly downloading = signal<string | null>(null);
  protected readonly downloadError = signal(false);

  protected formatSize(size: number): string {
    return formatBytes(size);
  }

  /** Clé i18n du badge de type (badge « PDF » dédié parmi les documents). */
  protected typeKey(resource: CourseResource): string {
    return resourceTypeLabelKey(resource);
  }

  /** Prévisualisable en modale : images et PDF (même règle que côté prof). */
  protected canPreview(resource: CourseResource): boolean {
    return resource.type === 'image' || isPdfResource(resource);
  }

  protected preview(resource: CourseResource): void {
    this.previewDialog()?.open(resource);
  }

  /** Présigne puis ouvre dans un onglet — motif `CourseResources.download`. */
  protected async download(resource: CourseResource): Promise<void> {
    if (this.downloading() !== null) {
      return;
    }
    this.downloading.set(resource.id);
    this.downloadError.set(false);
    try {
      const url = await this.#resolver.getDownloadUrl(this.courseId(), resource.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      this.downloadError.set(true);
    } finally {
      this.downloading.set(null);
    }
  }
}
