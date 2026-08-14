import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CourseService } from '../../../core/courses/course.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { formatBytes } from '../../../core/resources/resource.utils';

/** Plafond global d'une archive — miroir de `TRANSFER_MAX_ZIP_BYTES` du back (500 Mo). */
export const MAX_IMPORT_BYTES = 524_288_000;

/** Suffixe d'ids ARIA uniques par instance (compteur de module, jamais Date/Random). */
let sequence = 0;

/**
 * Modale d'import d'une archive de cours (.zip d'export). Élément `<dialog>`
 * natif calqué sur `BlockCreateDialog` (`open()`/`close()`, ref `#dialogEl`,
 * backdrop). Contrairement à elle, la modale appelle le service elle-même
 * (motif `CourseResources`/`ResourceService`) : choix du fichier, pré-contrôle
 * de taille, progression d'envoi (`importState`), erreurs par statut HTTP
 * (413/422/503), puis navigation vers le cours importé.
 */
@Component({
  selector: 'app-course-import-dialog',
  imports: [TranslocoPipe],
  templateUrl: './course-import-dialog.html',
  styleUrl: './course-import-dialog.scss',
})
export class CourseImportDialog {
  readonly #courses = inject(CourseService);
  readonly #router = inject(Router);
  readonly #language = inject(LanguageService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);

  /** viewChild `protected` (jamais `#`) ; ref template `#dialogEl` ≠ signal `dialog`. */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
  protected readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Préfixe d'ids ARIA propre à l'instance. */
  protected readonly uid = `course-import-${sequence++}`;

  protected readonly file = signal<File | null>(null);
  /** Clé i18n de l'erreur courante (sous `courses.import.*`), `null` sinon. */
  protected readonly errorKey = signal<string | null>(null);

  protected readonly state = this.#courses.importState;
  protected readonly busy = computed(
    () => this.state().phase === 'uploading' || this.state().phase === 'processing',
  );

  open(): void {
    this.file.set(null);
    this.errorKey.set(null);
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    // Pas de fermeture pendant l'envoi : l'état vit dans le service, mais la
    // navigation de fin surprendrait depuis une autre page.
    if (this.busy()) {
      return;
    }
    this.dialog()?.nativeElement.close();
  }

  /** Choix du fichier ; input vidé après lecture pour permettre le retry. */
  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.file.set(null);
      this.errorKey.set('tooBig');
      return;
    }
    this.errorKey.set(null);
    this.file.set(file);
  }

  protected async submit(): Promise<void> {
    const file = this.file();
    if (!file || this.busy()) {
      return;
    }
    this.errorKey.set(null);
    try {
      const course = await this.#courses.importCourse(file);
      this.dialog()?.nativeElement.close();
      this.#notifications.success(this.#transloco.translate('courses.import.success'));
      await this.#router.navigate(['/', this.#language.lang(), 'courses', course.id]);
    } catch (error) {
      this.errorKey.set(this.#errorKeyFrom(error));
    }
  }

  /** Erreur → clé i18n : 413 tooBig, 422 invalid, 503 storageError, sinon error. */
  #errorKeyFrom(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 413) {
        return 'tooBig';
      }
      if (error.status === 422) {
        return 'invalid';
      }
      if (error.status === 503) {
        return 'storageError';
      }
    }
    return 'error';
  }

  /** Taille lisible du fichier choisi (formatage maison, déterministe). */
  protected sizeOf(file: File): string {
    return formatBytes(file.size);
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }
}
