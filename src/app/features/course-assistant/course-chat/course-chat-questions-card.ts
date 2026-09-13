import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** État d'une série de questions dans le fil. */
export type QuestionsCardStatus = 'pending' | 'done' | 'unanswered';

/**
 * Carte d'un appel `ask_questions` dans le FIL du chat (tous modes) —
 * purement INFORMATIVE : les questions se répondent dans le formulaire qui
 * remplace le composer (`app-course-chat-questions`). Ici : le titre, puis
 * soit l'invite « en attente de votre réponse », soit le résultat du tour
 * `tool` (les questions et les choix du professeur, ou son refus — texte du
 * back), soit la mention d'une série restée sans réponse (conversation
 * rechargée après abandon ou expiration).
 */
@Component({
  selector: 'app-course-chat-questions-card',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-questions-card.html',
  styleUrl: './course-chat-questions-card.scss',
})
export class CourseChatQuestionsCard {
  /** Nombre de questions de la série (titre au singulier ou au pluriel). */
  readonly count = input.required<number>();
  readonly status = input.required<QuestionsCardStatus>();
  /** Résultat du tour `tool` (réponses ou refus) ; `null` tant qu'il n'existe pas. */
  readonly result = input<string | null>(null);
}
