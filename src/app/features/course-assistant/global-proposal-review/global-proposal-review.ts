import { Component, computed, effect, inject, input, untracked, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseAssistantService } from '../../../core/course-assistant/course-assistant.service';
import { NativeDialog } from '../../../shared/dialog/native-dialog.directive';
import { ExerciseProposalReview } from '../proposal-review/exercise-proposal-review';
import { ModuleProposalReview } from '../proposal-review/module-proposal-review';
import { PendingProposal, ProposalReview } from '../proposal-review/proposal-review';
import { StructureProposalReview } from '../proposal-review/structure-proposal-review';

/** Compteur de module : ids ARIA uniques par instance (jamais Date.now/Math.random). */
let uid = 0;

/**
 * Fenêtre de revue des propositions de l'**édition globale** — celles d'un
 * sous-assistant, et les propositions structurelles de l'assistant global
 * (ajout, suppression, réordonnancement de blocs : cible = le cours) :
 * `<dialog>` natif hébergé par `AssistantOutlet` À CÔTÉ du panneau flottant
 * (pas dedans : visible sur toute page du cours, éditeur mobile compris, où
 * le panneau s'efface). Elle rend la revue de l'hôte global
 * (`CourseAssistantService.proposals`) — diff texte, revue d'exercice, de
 * module ou de structure, réutilisées telles quelles avec leur pied de décision — sous un
 * en-tête qui nomme la cible ; tant que la cible n'est pas chargée, un état
 * d'attente qui laisse le rejet possible.
 *
 * Ouverte par le service à chaque nouvelle revue (`reviewVisible`), refermée
 * avec elle ; Escape, backdrop ou la croix la referment sans décider (la
 * proposition attend toujours — « Revoir » dans le fil la rouvre).
 */
@Component({
  selector: 'app-global-proposal-review',
  imports: [
    NativeDialog,
    TranslocoPipe,
    ProposalReview,
    ExerciseProposalReview,
    ModuleProposalReview,
    StructureProposalReview,
  ],
  templateUrl: './global-proposal-review.html',
  styleUrl: './global-proposal-review.scss',
})
export class GlobalProposalReview {
  /** Cours courant (résolution des `oc-resource:` de la revue d'exercice). */
  readonly courseId = input.required<string>();

  protected readonly assistant = inject(CourseAssistantService);
  protected readonly host = this.assistant.proposals;
  protected readonly dialog = viewChild(NativeDialog);
  protected readonly titleId = `global-proposal-review-title-${(uid += 1)}`;

  protected readonly review = computed(() => this.host.review());
  protected readonly textReview = computed(() => {
    const review = this.review();
    return review?.kind === 'text' ? review : null;
  });
  protected readonly textProposal = computed<PendingProposal | null>(() => {
    const review = this.textReview();
    return review === null
      ? null
      : {
          id: review.proposal.id,
          markdown: review.proposal.markdown,
          summary: review.proposal.summary,
        };
  });
  protected readonly exerciseReview = computed(() => {
    const review = this.review();
    return review?.kind === 'exercise' ? review : null;
  });
  protected readonly moduleReview = computed(() => {
    const review = this.review();
    return review?.kind === 'module' ? review : null;
  });
  protected readonly structureReview = computed(() => {
    const review = this.review();
    return review?.kind === 'structure' ? review : null;
  });

  /** Titre de la cible : celui de la revue, sinon de la délégation en attente. */
  protected readonly targetTitle = computed(
    () =>
      this.review()?.targetTitle ?? this.assistant.pendingProposal()?.delegation?.targetTitle ?? '',
  );

  /** Proposition en attente dont la revue n'est pas prête (cible en chargement). */
  protected readonly loading = computed(
    () => this.host.pending() !== null && this.review() === null,
  );

  /** Clé i18n de l'erreur de revue courante (`null` = aucune). */
  protected readonly errorKey = computed(() => {
    switch (this.host.error()) {
      case 'decision':
        return 'courseChat.proposal.decisionError';
      case 'target':
        return this.structureReview() !== null
          ? 'courseChat.proposal.structure.targetError'
          : 'courseChat.proposal.exercise.targetMissing';
      case 'apply':
        return 'courseChat.proposal.applyError';
      default:
        return null;
    }
  });

  constructor() {
    effect(() => {
      const visible = this.assistant.reviewVisible();
      const dialog = this.dialog();
      if (!dialog) {
        return;
      }
      untracked(() => {
        if (visible && !dialog.isOpen) {
          dialog.open();
        } else if (!visible && dialog.isOpen) {
          dialog.close();
        }
      });
    });
  }

  /** Fermeture (Escape, backdrop, croix) : la proposition attend toujours. */
  protected onClose(): void {
    this.assistant.hideReview();
  }

  protected accept(comment: string): void {
    void this.host.accept(comment);
  }

  protected reject(comment: string): void {
    void this.host.reject(comment);
  }
}
