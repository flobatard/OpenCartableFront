import { Component, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ModuleSummary } from '../../core/modules/module.model';
import { NativeDialog } from '../dialog/native-dialog.directive';

/**
 * Modale de choix d'un module interactif de la bibliothèque du cours à
 * insérer dans le markdown (`oc-module:<id>`). Présentational (élément
 * `<dialog>` natif : focus-trap, Escape et backdrop gérés par la plateforme)
 * — clone de `ResourcePickerDialog`. Le parent fournit la liste et reçoit le
 * choix via `(pick)`.
 */
@Component({
  selector: 'app-module-picker-dialog',
  imports: [NativeDialog, TranslocoPipe],
  templateUrl: './module-picker-dialog.html',
  styleUrl: './module-picker-dialog.scss',
})
export class ModulePickerDialog {
  /** Modules proposés (liste de l'onglet Modules du cours). */
  readonly modules = input.required<ModuleSummary[]>();

  /** Module choisi par l'utilisateur. */
  readonly pick = output<ModuleSummary>();

  protected readonly dialog = viewChild(NativeDialog);

  open(): void {
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
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
}
