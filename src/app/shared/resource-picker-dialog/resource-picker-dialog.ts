import { Component, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseResource } from '../../core/resources/resource.model';
import { resourceTypeLabelKey } from '../../core/resources/resource.utils';
import { NativeDialog } from '../dialog/native-dialog.directive';

/**
 * Modale de choix d'une ressource de la bibliothèque du cours à insérer dans le
 * markdown. Présentational (élément `<dialog>` natif : focus-trap, Escape et
 * backdrop gérés par la plateforme) — patron `MarkdownHelpDialog`. Le parent
 * fournit la liste (ressources `available`) et reçoit le choix via `(pick)`.
 */
@Component({
  selector: 'app-resource-picker-dialog',
  imports: [NativeDialog, TranslocoPipe],
  templateUrl: './resource-picker-dialog.html',
  styleUrl: './resource-picker-dialog.scss',
})
export class ResourcePickerDialog {
  /** Ressources proposées (déjà filtrées `available` par le parent). */
  readonly resources = input.required<CourseResource[]>();

  /** Ressource choisie par l'utilisateur. */
  readonly pick = output<CourseResource>();

  protected readonly dialog = viewChild(NativeDialog);

  /** Clé i18n du badge de type (badge « PDF » dédié parmi les documents). */
  protected typeKey(resource: CourseResource): string {
    return resourceTypeLabelKey(resource);
  }

  open(): void {
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
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
}
