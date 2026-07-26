import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ModuleSummary } from '../../core/modules/module.model';

/**
 * Modale de choix d'un module interactif de la bibliothèque du cours à
 * insérer dans le markdown (`oc-module:<id>`). Présentational (élément
 * `<dialog>` natif : focus-trap, Escape et backdrop gérés par la plateforme)
 * — clone de `ResourcePickerDialog`. Le parent fournit la liste et reçoit le
 * choix via `(pick)`.
 */
@Component({
  selector: 'app-module-picker-dialog',
  imports: [TranslocoPipe],
  templateUrl: './module-picker-dialog.html',
  styleUrl: './module-picker-dialog.scss',
})
export class ModulePickerDialog {
  /** Modules proposés (liste de l'onglet Modules du cours). */
  readonly modules = input.required<ModuleSummary[]>();

  /** Module choisi par l'utilisateur. */
  readonly pick = output<ModuleSummary>();

  /** Ref nommée `dialogEl` (jamais `dialog` : collision avec un signal). */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  open(): void {
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    this.dialog()?.nativeElement.close();
  }

  /**
   * Choix d'un module : on ferme D'ABORD (le focus revient au déclencheur),
   * puis on émet — l'insertion parente rend ensuite le focus à l'éditeur,
   * sinon la fermeture du `<dialog>` le lui reprendrait.
   */
  protected select(module: ModuleSummary): void {
    this.close();
    this.pick.emit(module);
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }
}
