import { effect, untracked } from '@angular/core';
import type { AssistantChatState } from './assistant-chat-state';

/**
 * Révèle le chat quand de NOUVELLES questions de l'assistant attendent : le
 * run est figé jusqu'à la réponse du professeur, un chat replié la rendrait
 * introuvable. L'hôte déplie son panneau ou sa colonne (`reveal`) une fois par
 * série de questions (id d'appel) — le professeur peut ensuite replier.
 * Crée un effect : à appeler dans un contexte d'injection.
 */
export function revealOnNewQuestions(
  state: Pick<AssistantChatState, 'pendingQuestions'>,
  reveal: () => void,
): void {
  let revealedId: string | null = null;
  effect(() => {
    const pending = state.pendingQuestions();
    if (pending === null || pending.id === revealedId) {
      return;
    }
    revealedId = pending.id;
    untracked(reveal);
  });
}
