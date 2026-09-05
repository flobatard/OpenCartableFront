import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AssistantExerciseProposal,
  PROPOSAL_TOOL_BY_KIND,
} from '../../../core/course-assistant/proposals';
import { ExerciseContentPayload } from '../../../core/courses/course.model';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';
import { ProposalDecision } from './proposal-decision';
import { ProposalDiff } from './proposal-diff';

/** Propositions du contexte `block_exercise` (alias local du type du core). */
export type ExerciseProposal = AssistantExerciseProposal;

/**
 * Revue STRUCTURÉE d'une proposition sur un exercice (flux HITL du contexte
 * `block_exercise`, une opération par proposition) : montée
 * par `BlockEditor` À LA PLACE de l'éditeur d'exercice (masqué par classe —
 * Monaco survit) dès qu'une proposition attend. Une carte par opération :
 *
 * - sujet : diff Monaco (sujet courant | proposé) ;
 * - modification d'une question : « Question n », diff de l'énoncé et/ou du
 *   corrigé (texte simple), le champ non touché marqué « (inchangé) » ;
 * - ajout : position (après la question n / en fin), énoncé rendu en markdown
 *   de cours (`app-markdown-view`, ressources résolues via `courseId`) et
 *   corrigé ;
 * - suppression : avertissement + la question courante rendue.
 *
 * `current` est l'instantané du formulaire de l'hôte À L'INTERRUPT (l'éditeur
 * est masqué pendant la revue, donc figé) : les questions y sont retrouvées
 * par id — cible disparue (supprimée dans un autre onglet) = `targetMissing`,
 * seul le rejet reste possible. Présentational — décision par les outputs via
 * le pied de page partagé `app-proposal-decision`.
 */
@Component({
  selector: 'app-exercise-proposal-review',
  imports: [TranslocoPipe, MarkdownView, ProposalDiff, ProposalDecision],
  templateUrl: './exercise-proposal-review.html',
  styleUrl: './exercise-proposal-review.scss',
})
export class ExerciseProposalReview {
  readonly proposal = input.required<ExerciseProposal>();
  /** Exercice courant (payload du formulaire de l'hôte, figé à l'interrupt). */
  readonly current = input.required<ExerciseContentPayload>();
  /** Cours propriétaire (résolution des `oc-resource:` du rendu). */
  readonly courseId = input<string | null>(null);
  readonly busy = input(false);
  readonly errorKey = input<string | null>(null);

  readonly accepted = output<string>();
  readonly rejected = output<string>();

  protected readonly titleKey = computed(
    () => `courseChat.proposal.titles.${PROPOSAL_TOOL_BY_KIND[this.proposal().kind]}`,
  );

  /** Index (0-based) de la question visée dans l'exercice courant ; `-1` si absente ou sans objet. */
  protected readonly targetIndex = computed(() => {
    const proposal = this.proposal();
    if (
      proposal.kind !== 'exercise_question_edit' &&
      proposal.kind !== 'exercise_question_delete'
    ) {
      return -1;
    }
    return this.current().questions.findIndex((q) => q.id === proposal.questionId);
  });

  protected readonly targetQuestion = computed(
    () => this.current().questions[this.targetIndex()] ?? null,
  );

  /** Proposition sur une question qui n'existe plus : rejet seul. */
  protected readonly targetMissing = computed(() => {
    const kind = this.proposal().kind;
    return (
      (kind === 'exercise_question_edit' || kind === 'exercise_question_delete') &&
      this.targetIndex() < 0
    );
  });

  /** Ajout : index de la question après laquelle insérer ; `-1` = fin d'exercice. */
  protected readonly afterIndex = computed(() => {
    const proposal = this.proposal();
    if (proposal.kind !== 'exercise_question_add' || proposal.afterId === null) {
      return -1;
    }
    return this.current().questions.findIndex((q) => q.id === proposal.afterId);
  });
}
