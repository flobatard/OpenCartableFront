import { Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseResource } from '../../core/resources/resource.model';
import { CoursePreviewDocument } from '../course-blocks-view/course-preview-document';

/**
 * Modale d'aperçu d'une ressource (bouton « Voir » de l'onglet Ressources).
 * Présentational (élément `<dialog>` natif : focus-trap, Escape et backdrop
 * gérés par la plateforme) — patron `ResourcePickerDialog`. Le rendu délègue à
 * `CoursePreviewDocument` : présignature, PDF embarqué (bypass documenté là-bas)
 * et rangée ouvrir/télécharger, exactement le rendu que verra l'élève.
 *
 * `(close)` natif → `current` remis à `null` : l'embed est DÉMONTÉ à la
 * fermeture. L'effect de `CoursePreviewDocument` ne re-présigne que si la
 * ressource change — sans ce démontage, rouvrir la même ressource après
 * expiration du TTL afficherait une URL morte.
 */
@Component({
  selector: 'app-resource-preview-dialog',
  imports: [TranslocoPipe, CoursePreviewDocument],
  templateUrl: './resource-preview-dialog.html',
  styleUrl: './resource-preview-dialog.scss',
})
export class ResourcePreviewDialog {
  readonly courseId = input.required<string>();

  /** Ref nommée `dialogEl` (jamais `dialog` : collision avec un signal). */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  /** Ressource affichée (`null` = modale fermée, embed démonté). */
  protected readonly current = signal<CourseResource | null>(null);

  open(resource: CourseResource): void {
    this.current.set(resource);
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    this.dialog()?.nativeElement.close();
  }

  /** `close` natif (Escape compris) : démonte l'embed. */
  protected onClosed(): void {
    this.current.set(null);
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }
}
