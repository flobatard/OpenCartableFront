import { Component, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiSettings } from '../ai-settings/ai-settings';
import { NativeDialog } from '../../../shared/dialog/native-dialog.directive';

/** Suffixe d'ids ARIA uniques par instance (compteur de module, jamais Date/Random). */
let sequence = 0;

/**
 * Modale « Réglages IA » du panneau assistant : change le modèle à la volée
 * sans quitter le cours. Élément `<dialog>` natif au motif `CourseStyleDialog`
 * (`open()`/`close()`, directive `ocDialog`) qui ENCASTRE l'écran de
 * réglages complet (`app-ai-settings [embedded]`) — une seule source de
 * vérité : toute sauvegarde passe par `AiCredentialsService`, dont le signal
 * met à jour le panneau assistant immédiatement.
 *
 * Le contenu n'est monté qu'à la PREMIÈRE ouverture (`opened`, jamais remis à
 * faux) : l'écran de réglages sonde l'API à son init — inutile tant que la
 * modale n'a jamais été ouverte — puis conserve son état entre deux
 * ouvertures (saisie en cours comprise).
 */
@Component({
  selector: 'app-ai-settings-dialog',
  imports: [NativeDialog, TranslocoPipe, AiSettings],
  templateUrl: './ai-settings-dialog.html',
  styleUrl: './ai-settings-dialog.scss',
})
export class AiSettingsDialog {
  protected readonly dialog = viewChild(NativeDialog);

  /** Préfixe d'ids ARIA propre à l'instance. */
  protected readonly uid = `ai-settings-dialog-${sequence++}`;

  /** Contenu monté à la première ouverture, puis conservé. */
  protected readonly opened = signal(false);

  open(): void {
    this.opened.set(true);
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
  }
}
