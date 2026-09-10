import { Component, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssistantConversation } from '../../../core/course-assistant/assistant.model';
import { armedAction } from '../../../core/editing/armed';
import { LanguageService } from '../../../core/i18n/language.service';

/**
 * Historique des conversations (vue liste de `CourseChat`) : une ligne par
 * conversation — bouton d'ouverture (titre, date de mise à jour) et
 * suppression en deux temps (`armedAction`, désarmée au blur). Présentation
 * seule : l'hôte ouvre et supprime sur son instance d'`AssistantChatState`.
 */
@Component({
  selector: 'app-course-chat-conversations',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-conversations.html',
  styleUrl: './course-chat-conversations.scss',
})
export class CourseChatConversations {
  readonly conversations = input.required<readonly AssistantConversation[]>();
  /** Ouverture demandée (id de la conversation). */
  readonly openConversation = output<string>();
  /** Suppression confirmée (second clic sur la même ligne). */
  readonly deleteConversation = output<string>();

  readonly #language = inject(LanguageService);
  protected readonly deleteArmed = armedAction<string>();

  /** Suppression en deux temps, désarmée au blur. */
  protected requestDelete(id: string): void {
    if (this.deleteArmed.confirm(id)) {
      this.deleteConversation.emit(id);
    }
  }

  /** Date dans la locale de l'UI (pas de DatePipe : locale fr non enregistrée). */
  protected updatedOn(iso: string): string {
    return new Date(iso).toLocaleDateString(this.#language.lang());
  }
}
