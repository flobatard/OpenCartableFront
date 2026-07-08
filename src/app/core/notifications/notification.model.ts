/** Sévérité d'une notification globale (snackbar). */
export type NotificationSeverity = 'error' | 'info' | 'success' | 'warning';

/**
 * Une notification affichée par la snackbar globale. `message` est déjà
 * traduit par l'émetteur : le service et le composant ignorent l'i18n.
 */
export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly severity: NotificationSeverity;
}
