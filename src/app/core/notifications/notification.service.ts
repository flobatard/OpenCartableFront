import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NotificationSeverity, Toast } from './notification.model';

/** Durée d'affichage avant auto-fermeture, par sévérité (ms). */
const AUTO_DISMISS_MS: Record<NotificationSeverity, number> = {
  error: 9000,
  warning: 7000,
  info: 6000,
  success: 5000,
};

/**
 * File in-memory des notifications globales (snackbar). Variante « service à
 * signaux » du projet, sans HTTP : les émetteurs (ex. AuthService) poussent un
 * message déjà traduit, le composant Snackbar rend le signal.
 *
 * SSR-safe : au serveur les timers d'auto-fermeture ne sont jamais armés
 * (personne ne pousse de toast au rendu serveur, mais la garde évite tout
 * timer résiduel).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #toasts = signal<readonly Toast[]>([]);
  readonly toasts = this.#toasts.asReadonly();

  #nextId = 0;
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();

  error(message: string): void {
    this.#push(message, 'error');
  }

  warning(message: string): void {
    this.#push(message, 'warning');
  }

  info(message: string): void {
    this.#push(message, 'info');
  }

  success(message: string): void {
    this.#push(message, 'success');
  }

  dismiss(id: number): void {
    const timer = this.#timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#timers.delete(id);
    }
    this.#toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  #push(message: string, severity: NotificationSeverity): void {
    // Dédoublonnage léger : ne pas empiler un toast identique déjà visible.
    if (this.#toasts().some((toast) => toast.message === message && toast.severity === severity)) {
      return;
    }

    const id = this.#nextId++;
    this.#toasts.update((toasts) => [...toasts, { id, message, severity }]);

    if (this.#isBrowser) {
      this.#timers.set(
        id,
        setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS[severity]),
      );
    }
  }
}
