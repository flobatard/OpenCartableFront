import { computed, signal, untracked } from '@angular/core';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { AssistantPendingProposal } from '../../../core/course-assistant/proposals';
import { ExerciseContentPayload } from '../../../core/courses/course.model';
import { ExerciseProposal } from './exercise-proposal-review';
import { PendingProposal } from './proposal-review';

/** Ce que l'hôte doit afficher : la revue texte (diff) ou la revue exercice. */
export type ProposalReviewView =
  | { kind: 'text'; proposal: PendingProposal; original: string }
  | { kind: 'exercise'; proposal: ExerciseProposal; current: ExerciseContentPayload };

/**
 * `decision` : l'envoi de la décision a échoué (réessayable) ; `target` : la
 * cible de la proposition n'existe plus dans l'éditeur (rien n'a été
 * appliqué — le professeur rejette).
 */
export type ProposalHostError = 'decision' | 'target';

export interface ProposalHostDeps {
  /** Instance d'état du chat ancré (proposition en attente + reprise). */
  state: Pick<AssistantChatState, 'pendingProposal' | 'resumeProposal'>;
  /** Markdown courant du bloc texte (« original » du diff). */
  currentMarkdown: () => string;
  /** Exercice courant (payload du formulaire) ; `null` hors bloc exercice. */
  currentExercise: () => ExerciseContentPayload | null;
  /** Applique une réécriture de bloc texte dans l'éditeur. */
  applyText: (markdown: string) => void;
  /** Applique une proposition d'exercice ; `false` = cible introuvable. */
  applyExercise: (proposal: ExerciseProposal) => boolean;
}

/**
 * Orchestration des revues de proposition HITL de `BlockEditor` — classe
 * simple (pas un composant) construite par la page avec ses callbacks : elle
 * dérive la vue de revue de la proposition en attente de l'état du chat
 * (`review` — texte ou exercice, avec l'« original » figé à l'instant de la
 * proposition : l'éditeur est masqué pendant la revue), porte `busy`/`error`,
 * et enchaîne décision → application → reprise du run (`resumeProposal` — le
 * résultat du tool devient la décision, la suite du tour streame dans le chat
 * et la revue s'efface avec la proposition). Une acceptation dont la cible a
 * disparu n'applique rien et n'envoie rien (`error = 'target'`).
 */
export class ProposalHost {
  readonly #deps: ProposalHostDeps;

  /** Envoi de la décision en vol. */
  readonly busy = signal(false);
  readonly error = signal<ProposalHostError | null>(null);

  readonly pending = computed<AssistantPendingProposal | null>(() =>
    this.#deps.state.pendingProposal(),
  );

  readonly review = computed<ProposalReviewView | null>(() => {
    const proposal = this.pending();
    if (proposal === null) {
      return null;
    }
    if (proposal.kind === 'block_text') {
      return {
        kind: 'text',
        proposal: { id: proposal.id, markdown: proposal.markdown, summary: proposal.summary },
        original: untracked(this.#deps.currentMarkdown),
      };
    }
    const current = untracked(this.#deps.currentExercise);
    return current === null ? null : { kind: 'exercise', proposal, current };
  });

  constructor(deps: ProposalHostDeps) {
    this.#deps = deps;
  }

  /** La revue s'est refermée (proposition consommée ou abandonnée). */
  reset(): void {
    this.busy.set(false);
    this.error.set(null);
  }

  /**
   * « Accepter et appliquer » : application dans l'éditeur (texte : édit
   * Monaco annulable ; exercice : opération unitaire) PUIS reprise du run avec
   * la décision. Cible disparue : rien n'est appliqué, erreur `target`.
   */
  async accept(comment: string): Promise<void> {
    const proposal = this.pending();
    if (proposal === null) {
      return;
    }
    this.error.set(null);
    if (proposal.kind === 'block_text') {
      this.#deps.applyText(proposal.markdown);
    } else if (!this.#deps.applyExercise(proposal)) {
      this.error.set('target');
      return;
    }
    await this.#decide(true, comment);
  }

  async reject(comment: string): Promise<void> {
    if (this.pending() === null) {
      return;
    }
    await this.#decide(false, comment);
  }

  async #decide(accepted: boolean, comment: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const resumed = await this.#deps.state.resumeProposal({
      accepted,
      ...(comment ? { comment } : {}),
    });
    this.busy.set(false);
    if (!resumed && this.pending() !== null) {
      // Reprise non partie mais toujours possible (échec réseau ≠ 404) :
      // la revue reste affichée, réessayable.
      this.error.set('decision');
    }
  }
}
