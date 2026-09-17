import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PROPOSAL_TOOLS } from '../../../core/course-assistant/proposals';

/**
 * Carte d'une proposition d'édition dans le FIL du chat — purement
 * INFORMATIVE : la revue (diff/carte + décision) se fait dans l'éditeur (mode
 * edit de `CourseChat`), qui affiche sa revue à la place du champ édité tant
 * que la proposition attend — ou, pour une proposition de sous-assistant
 * (édition globale, carte de délégation), dans la fenêtre globale, que le
 * bouton « Revoir » rouvre (`reviewable`). Ici : le titre selon le tool
 * (`toolName` — réécriture d'un bloc texte, sujet/question d'un exercice…),
 * le résumé du modèle, puis soit l'invite « en attente de votre décision »
 * (appel en cours — le flux est bloqué sur la gate HITL du back), soit la
 * décision rendue (contenu du tour `tool` : acceptée/rejetée + commentaire)
 * — y compris pour les conversations rechargées.
 */
@Component({
  selector: 'app-course-chat-proposal',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-proposal.html',
  styleUrl: './course-chat-proposal.scss',
})
export class CourseChatProposal {
  /** Tool de proposition à l'origine de la carte (titre dédié ; repli générique). */
  readonly toolName = input<string | null>(null);
  /** Résumé fourni par le modèle (`summary` des args), `null` s'il l'a omis. */
  readonly summary = input<string | null>(null);
  /** État de l'appel : `running` = décision attendue (éditeur ou fenêtre globale). */
  readonly status = input.required<'running' | 'done' | 'error'>();
  /** Décision rendue (extrait du tour `tool`) ; `null` tant que rien n'est tranché. */
  readonly result = input<string | null>(null);
  /** Proposition revue dans la fenêtre globale : invite dédiée et bouton « Revoir ». */
  readonly reviewable = input(false);

  /** Le professeur veut rouvrir la fenêtre de revue (proposition de sous-assistant). */
  readonly review = output<void>();

  protected readonly titleKey = computed(() => {
    const name = this.toolName();
    return name && PROPOSAL_TOOLS.has(name)
      ? `courseChat.proposal.titles.${name}`
      : 'courseChat.proposal.title';
  });

  protected readonly pendingKey = computed(() =>
    this.reviewable() ? 'courseChat.proposal.pendingHintGlobal' : 'courseChat.proposal.pendingHint',
  );
}
