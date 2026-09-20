import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AssistantStructureProposal,
  PROPOSAL_TOOL_BY_KIND,
} from '../../../core/course-assistant/proposals';
import { CourseBlock } from '../../../core/courses/course.model';
import { reorderTarget } from '../../../core/courses/structure-apply';
import { ProposalDecision } from './proposal-decision';

/** Une ligne de la liste « après » d'un réordonnancement. */
interface ReorderRow {
  block: CourseBlock;
  /** Rang d'origine (1-based) ; le bloc a bougé s'il diffère du nouveau rang. */
  from: number;
  moved: boolean;
}

/**
 * Revue d'une proposition STRUCTURELLE de l'assistant global (édition
 * globale : ajouter, supprimer, réordonner des blocs), montée par la fenêtre
 * de revue globale. Aucun contenu à comparer — une carte par opération :
 *
 * - ajout : type, titre, description, ressource ou module pointé, position
 *   (après « X » / en fin de cours) — le bloc sera créé vide ;
 * - suppression : avertissement (irréversible) + le bloc visé ;
 * - réordonnancement : l'ordre proposé, numéroté, chaque bloc déplacé marqué
 *   de son rang d'origine.
 *
 * `blocks` est l'instantané des blocs du cours figé par l'hôte à la revue :
 * un bloc visé disparu, ou un ordre qui ne porte plus exactement les blocs du
 * cours, est `targetMissing` — seul le rejet reste possible. Présentational :
 * décision par les outputs via `app-proposal-decision`.
 */
@Component({
  selector: 'app-structure-proposal-review',
  imports: [TranslocoPipe, ProposalDecision],
  templateUrl: './structure-proposal-review.html',
  styleUrl: './structure-proposal-review.scss',
})
export class StructureProposalReview {
  readonly proposal = input.required<AssistantStructureProposal>();
  /** Blocs courants du cours (ordre d'affichage), figés à la revue. */
  readonly blocks = input.required<CourseBlock[]>();
  readonly busy = input(false);
  readonly errorKey = input<string | null>(null);

  readonly accepted = output<string>();
  readonly rejected = output<string>();

  protected readonly titleKey = computed(
    () => `courseChat.proposal.titles.${PROPOSAL_TOOL_BY_KIND[this.proposal().kind]}`,
  );

  /** Ajout : bloc après lequel insérer ; `null` = en fin de cours (ou repère disparu). */
  protected readonly afterBlock = computed(() => {
    const proposal = this.proposal();
    if (proposal.kind !== 'block_add' || proposal.afterId === null) {
      return null;
    }
    return this.blocks().find((block) => block.id === proposal.afterId) ?? null;
  });

  /** Suppression : le bloc visé et son rang (1-based) ; `null` s'il a disparu. */
  protected readonly deleted = computed(() => {
    const proposal = this.proposal();
    if (proposal.kind !== 'block_delete') {
      return null;
    }
    const index = this.blocks().findIndex((block) => block.id === proposal.blockId);
    return index < 0 ? null : { block: this.blocks()[index], position: index + 1 };
  });

  /** Réordonnancement : l'ordre proposé ; `null` s'il ne porte plus exactement les blocs du cours. */
  protected readonly reordered = computed<ReorderRow[] | null>(() => {
    const proposal = this.proposal();
    if (proposal.kind !== 'blocks_reorder') {
      return null;
    }
    const blocks = this.blocks();
    const order = reorderTarget(
      blocks.map((block) => block.id),
      proposal.blockIds,
    );
    if (order === null) {
      return null;
    }
    return order.map((id, index) => {
      const from = blocks.findIndex((block) => block.id === id);
      return { block: blocks[from], from: from + 1, moved: from !== index };
    });
  });

  /** Proposition devenue inapplicable (le cours a changé depuis) : rejet seul. */
  protected readonly targetMissing = computed(() => {
    switch (this.proposal().kind) {
      case 'block_delete':
        return this.deleted() === null;
      case 'blocks_reorder':
        return this.reordered() === null;
      default:
        return false;
    }
  });
}
