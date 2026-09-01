import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Nom du tool HITL côté back (`app/course_assistant/tools.py`). */
export const PROPOSE_BLOCK_EDIT = 'propose_block_edit';

/**
 * Carte d'une proposition de réécriture dans le FIL du chat (mode block de
 * `CourseChat`) — purement INFORMATIVE : la revue (diff + décision) se fait
 * dans l'éditeur, qui affiche `app-proposal-review` à la place du champ
 * markdown tant que la proposition attend. Ici : le résumé du modèle, puis
 * soit l'invite « en attente de votre décision » (appel en cours — le flux
 * est bloqué sur la gate HITL du back), soit la décision rendue (contenu du
 * tour `tool` : acceptée/rejetée + commentaire) — y compris pour les
 * conversations rechargées.
 */
@Component({
  selector: 'app-course-chat-proposal',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-proposal.html',
  styleUrl: './course-chat-proposal.scss',
})
export class CourseChatProposal {
  /** Résumé fourni par le modèle (`summary` des args), `null` s'il l'a omis. */
  readonly summary = input<string | null>(null);
  /** État de l'appel : `running` = décision attendue dans l'éditeur. */
  readonly status = input.required<'running' | 'done' | 'error'>();
  /** Décision rendue (extrait du tour `tool`) ; `null` tant que rien n'est tranché. */
  readonly result = input<string | null>(null);
}
