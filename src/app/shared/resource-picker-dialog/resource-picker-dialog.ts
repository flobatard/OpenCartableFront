import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseResource } from '../../core/resources/resource.model';

/**
 * Modale de choix d'une ressource de la bibliothèque du cours à insérer dans le
 * markdown. Présentational (élément `<dialog>` natif : focus-trap, Escape et
 * backdrop gérés par la plateforme) — patron `MarkdownHelpDialog`. Le parent
 * fournit la liste (ressources `disponible`) et reçoit le choix via `(pick)`.
 */
@Component({
  selector: 'app-resource-picker-dialog',
  imports: [TranslocoPipe],
  templateUrl: './resource-picker-dialog.html',
  styleUrl: './resource-picker-dialog.scss',
})
export class ResourcePickerDialog {
  /** Ressources proposées (déjà filtrées `disponible` par le parent). */
  readonly resources = input.required<CourseResource[]>();

  /** Ressource choisie par l'utilisateur. */
  readonly pick = output<CourseResource>();

  /** Ref nommée `dialogEl` (jamais `dialog` : collision avec un signal). */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  open(): void {
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    this.dialog()?.nativeElement.close();
  }

  /**
   * Choix d'une ressource : on ferme D'ABORD (le focus revient au déclencheur),
   * puis on émet — l'insertion parente rend ensuite le focus à l'éditeur, sinon
   * la fermeture du `<dialog>` le lui reprendrait.
   */
  protected select(resource: CourseResource): void {
    this.close();
    this.pick.emit(resource);
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }
}
