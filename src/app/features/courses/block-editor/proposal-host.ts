import { untracked } from '@angular/core';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { ProposalHost, ProposalHostError } from '../../../core/course-assistant/proposal-host';
import { AssistantPendingProposal } from '../../../core/course-assistant/proposals';
import { ExerciseContentPayload } from '../../../core/courses/course.model';
import { ExerciseProposal } from './exercise-proposal-review';
import { PendingProposal } from './proposal-review';

/** Ce que l'hôte doit afficher : la revue texte (diff) ou la revue exercice. */
export type ProposalReviewView =
  | { kind: 'text'; proposal: PendingProposal; original: string }
  | { kind: 'exercise'; proposal: ExerciseProposal; current: ExerciseContentPayload };

export type { ProposalHostError };

export interface BlockProposalHostDeps {
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

function isExerciseProposal(proposal: AssistantPendingProposal): proposal is ExerciseProposal {
  return proposal.kind.startsWith('exercise_');
}

/**
 * Hôte de revue de `BlockEditor` : spécialise le `ProposalHost` générique
 * (`core/course-assistant/`) pour les deux contextes d'édition d'un bloc — la
 * vue de revue est dérivée par `kind` (texte : diff sur l'« original » figé à
 * l'instant de la proposition, l'éditeur étant masqué pendant la revue ;
 * exercice : revue structurée sur l'état courant du formulaire) et
 * l'application est déléguée aux callbacks de la page.
 */
export function buildBlockProposalHost(
  deps: BlockProposalHostDeps,
): ProposalHost<ProposalReviewView> {
  return new ProposalHost<ProposalReviewView>({
    state: deps.state,
    buildReview: (proposal) => {
      if (proposal.kind === 'block_text') {
        return {
          kind: 'text',
          proposal: { id: proposal.id, markdown: proposal.markdown, summary: proposal.summary },
          original: untracked(deps.currentMarkdown),
        };
      }
      if (!isExerciseProposal(proposal)) {
        return null; // proposition d'un autre hôte (module) : rien à revoir ici
      }
      const current = untracked(deps.currentExercise);
      return current === null ? null : { kind: 'exercise', proposal, current };
    },
    apply: (proposal) => {
      if (proposal.kind === 'block_text') {
        deps.applyText(proposal.markdown);
        return true;
      }
      return isExerciseProposal(proposal) && deps.applyExercise(proposal);
    },
  });
}
