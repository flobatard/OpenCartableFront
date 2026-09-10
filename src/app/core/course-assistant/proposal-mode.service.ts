import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { AnalyticsService } from '../analytics/analytics.service';
import { ALWAYS_REVIEWED_KINDS, AssistantPendingProposal, ProposalMode } from './proposals';

const STORAGE_KEY = 'oc-assistant-proposal-mode';

/**
 * Mode de décision des propositions HITL des chats d'édition, basculé depuis
 * le pied du chat : `ask` (défaut) = revue dans l'éditeur puis clic ; `auto` =
 * la proposition est appliquée et acceptée sans revue (`ProposalHost`), sauf
 * les genres de `ALWAYS_REVIEWED_KINDS`. Purement front : la route de
 * décision du back ne mute rien, c'est déjà le front qui applique puis
 * accepte — le mode auto fait ce clic à la place du professeur.
 *
 * Préférence du navigateur (`oc-assistant-proposal-mode`), commune à tous les
 * éditeurs ; stockage indisponible = le mode vaut pour la page courante.
 */
@Injectable({ providedIn: 'root' })
export class ProposalModeService {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #analytics = inject(AnalyticsService);

  readonly #mode = signal<ProposalMode>('ask');
  readonly mode = this.#mode.asReadonly();

  constructor() {
    if (!this.#isBrowser) {
      return;
    }
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'auto') {
        this.#mode.set('auto');
      }
    } catch {
      // stockage indisponible (navigation privée) : mode par défaut
    }
  }

  setMode(mode: ProposalMode): void {
    if (mode === this.#mode()) {
      return;
    }
    this.#mode.set(mode);
    this.#analytics.capture('assistant_proposal_mode_changed', { mode });
    if (!this.#isBrowser) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // stockage indisponible : le mode vaut pour la page courante
    }
  }

  toggle(): void {
    this.setMode(this.#mode() === 'auto' ? 'ask' : 'auto');
  }

  /** Cette proposition doit-elle être acceptée sans revue ? */
  shouldAutoAccept(proposal: AssistantPendingProposal): boolean {
    return this.#mode() === 'auto' && !ALWAYS_REVIEWED_KINDS.has(proposal.kind);
  }
}
