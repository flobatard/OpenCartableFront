import { computed, effect, signal, Signal, untracked } from '@angular/core';
import { AssistantChatState } from './assistant-chat-state';
import { AssistantPendingProposal } from './proposals';

/**
 * `decision` : l'envoi de la décision a échoué (réessayable) ; `target` : la
 * cible de la proposition n'existe plus dans l'éditeur (rien n'a été
 * appliqué — le professeur rejette).
 */
export type ProposalHostError = 'decision' | 'target';

export interface ProposalHostDeps<V> {
  /** Instance d'état du chat ancré (proposition en attente + reprise). */
  state: Pick<AssistantChatState, 'pendingProposal' | 'resumeProposal'>;
  /**
   * Vue de revue à afficher pour cette proposition, ou `null` si l'hôte ne
   * sait pas la revoir (état pas encore prêt). C'est ici que l'hôte fige
   * (`untracked`) le contenu courant qui servira d'« original » au diff :
   * son éditeur est masqué pendant toute la revue.
   */
  buildReview: (proposal: AssistantPendingProposal) => V | null;
  /** Applique la proposition dans l'éditeur ; `false` = cible introuvable. */
  apply: (proposal: AssistantPendingProposal) => boolean;
  /**
   * Mode « édition auto » (`ProposalModeService.shouldAutoAccept`) : `true` =
   * la proposition est appliquée et acceptée sans revue. Consulté UNE fois, à
   * l'arrivée de la proposition — basculer le mode pendant une revue ne la
   * décide pas. Fourni, il exige un contexte d'injection à la construction
   * (effect).
   */
  autoAccept?: (proposal: AssistantPendingProposal) => boolean;
}

/**
 * Orchestration des revues de proposition HITL, partagée par les hôtes
 * d'édition (éditeur de bloc, éditeur de module) — classe simple (pas un
 * composant) construite par la page avec ses callbacks : elle dérive la vue de
 * revue de la proposition en attente de l'état du chat (`review`, dont la
 * forme appartient à l'hôte), porte `busy`/`error`, et enchaîne décision →
 * application → reprise du run (`resumeProposal` — le résultat du tool devient
 * la décision, la suite du tour streame dans le chat et la revue s'efface avec
 * la proposition). Une acceptation dont la cible a disparu n'applique rien et
 * n'envoie rien (`error = 'target'`).
 *
 * Mode auto (`autoAccept`) : l'acceptation part dès l'arrivée de la
 * proposition, depuis un effect — qui tourne avant le rendu de l'hôte, donc
 * `review` reste `null` et la revue n'apparaît jamais. Une tentative par
 * proposition ; cible disparue ou envoi en échec = repli sur la revue
 * manuelle, avec son erreur et l'« original » d'avant l'application.
 */
export class ProposalHost<V> {
  readonly #deps: ProposalHostDeps<V>;

  /** Envoi de la décision en vol. */
  readonly busy = signal(false);
  readonly error = signal<ProposalHostError | null>(null);

  readonly pending: Signal<AssistantPendingProposal | null> = computed(() =>
    this.#deps.state.pendingProposal(),
  );

  /** Revue figée à l'arrivée de la proposition (« original » du diff compris). */
  readonly #frozenReview: Signal<V | null> = computed(() => {
    const proposal = this.pending();
    return proposal === null ? null : this.#deps.buildReview(proposal);
  });

  /** Proposition en cours d'acceptation automatique : sa revue est masquée. */
  readonly #autoId = signal<string | null>(null);
  /** Dernière proposition soumise au mode auto (une seule tentative par id). */
  #autoTried: string | null = null;

  /** Revue à afficher (`null` : aucune proposition, ou acceptation auto en vol). */
  readonly review: Signal<V | null> = computed(() => {
    const proposal = this.pending();
    return proposal === null || this.#autoId() === proposal.id ? null : this.#frozenReview();
  });

  constructor(deps: ProposalHostDeps<V>) {
    this.#deps = deps;
    const autoAccept = deps.autoAccept;
    if (autoAccept) {
      effect(() => {
        const proposal = this.pending();
        if (proposal === null || proposal.id === this.#autoTried) {
          return;
        }
        this.#autoTried = proposal.id;
        untracked(() => {
          if (autoAccept(proposal)) {
            void this.#autoAccept(proposal);
          }
        });
      });
    }
  }

  /** La revue s'est refermée (proposition consommée ou abandonnée). */
  reset(): void {
    this.busy.set(false);
    this.error.set(null);
  }

  /**
   * « Accepter et appliquer » : application dans l'éditeur (édit Monaco
   * annulable, ou opération de formulaire) PUIS reprise du run avec la
   * décision. Cible disparue : rien n'est appliqué, erreur `target`.
   */
  async accept(comment: string): Promise<void> {
    const proposal = this.pending();
    if (proposal === null) {
      return;
    }
    await this.#acceptProposal(proposal, comment, false);
  }

  async reject(comment: string): Promise<void> {
    if (this.pending() === null) {
      return;
    }
    await this.#decide(false, comment, false);
  }

  async #autoAccept(proposal: AssistantPendingProposal): Promise<void> {
    // « Original » figé AVANT l'application (le computed est paresseux) : un
    // repli sur la revue manuelle doit montrer le vrai diff.
    this.#frozenReview();
    this.#autoId.set(proposal.id);
    const resumed = await this.#acceptProposal(proposal, '', true);
    // Échec (cible disparue, envoi refusé) : repli sur la revue manuelle, avec
    // son erreur — sauf si une proposition suivante a déjà pris la main.
    if (!resumed && this.#autoId() === proposal.id) {
      this.#autoId.set(null);
    }
  }

  /** Retourne `true` si la reprise est partie. */
  async #acceptProposal(
    proposal: AssistantPendingProposal,
    comment: string,
    auto: boolean,
  ): Promise<boolean> {
    this.error.set(null);
    if (!this.#deps.apply(proposal)) {
      this.error.set('target');
      return false;
    }
    return this.#decide(true, comment, auto);
  }

  async #decide(accepted: boolean, comment: string, auto: boolean): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    const resumed = await this.#deps.state.resumeProposal({
      accepted,
      ...(comment ? { comment } : {}),
      ...(auto ? { auto } : {}),
    });
    this.busy.set(false);
    if (!resumed && this.pending() !== null) {
      // Reprise non partie mais toujours possible (échec réseau ≠ 404) :
      // la revue reste affichée, réessayable.
      this.error.set('decision');
    }
    return resumed;
  }
}
