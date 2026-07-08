import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../core/notifications/notification.service';

/**
 * Rendu des notifications globales (bas-gauche). Purement présentational : lit
 * `NotificationService.toasts()` et délègue la fermeture au service. Monté une
 * seule fois dans le shell (app.html) ; au SSR la liste est vide.
 */
@Component({
  selector: 'app-snackbar',
  imports: [TranslocoPipe],
  templateUrl: './snackbar.html',
  styleUrl: './snackbar.scss',
})
export class Snackbar {
  readonly #notifications = inject(NotificationService);

  protected readonly toasts = this.#notifications.toasts;

  protected dismiss(id: number): void {
    this.#notifications.dismiss(id);
  }
}
