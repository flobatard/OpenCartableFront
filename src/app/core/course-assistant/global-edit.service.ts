import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { AnalyticsService } from '../analytics/analytics.service';

const STORAGE_KEY = 'oc-assistant-global-edit';

/**
 * Édition globale du panneau flottant : basculée depuis son pied, elle
 * autorise l'assistant du cours à confier la modification d'un bloc ou d'un
 * module à un sous-assistant d'édition (`delegation.ts`). Envoyée à chaque
 * tour (`allow_edit` du message, `CourseAssistantService.turnOptions`) : le
 * back n'expose les tools de délégation et le prompt qui les décrit que sur
 * demande, et rejoue le choix du tour à la reprise — basculer pendant une
 * attente ne change pas le tour en cours.
 *
 * Préférence du navigateur (`oc-assistant-global-edit`, désactivée par
 * défaut, motif de `ProposalModeService`) ; stockage indisponible = le choix
 * vaut pour la page courante.
 */
@Injectable({ providedIn: 'root' })
export class GlobalEditService {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #analytics = inject(AnalyticsService);

  readonly #enabled = signal(false);
  readonly enabled = this.#enabled.asReadonly();

  constructor() {
    if (!this.#isBrowser) {
      return;
    }
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'on') {
        this.#enabled.set(true);
      }
    } catch {
      // stockage indisponible (navigation privée) : désactivée par défaut
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.#enabled()) {
      return;
    }
    this.#enabled.set(enabled);
    this.#analytics.capture('assistant_global_edit_changed', { enabled });
    if (!this.#isBrowser) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // stockage indisponible : le choix vaut pour la page courante
    }
  }

  toggle(): void {
    this.setEnabled(!this.#enabled());
  }
}
