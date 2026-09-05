import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AssistantConversation, AssistantConversationDetail } from './assistant.model';

/**
 * Accès HTTP aux conversations de l'assistant d'un cours
 * (`/v1/courses/{id}/assistant/conversations`) : CRUD par `HttpClient`
 * (Bearer automatique, URL sous `apiUrl`) et URLs des deux flux SSE —
 * consommés par `postSseStream`, hors HttpClient. Sans état : l'état vit dans
 * `AssistantChatState`.
 */
@Injectable({ providedIn: 'root' })
export class AssistantConversationsApi {
  readonly #http = inject(HttpClient);

  base(courseId: string): string {
    return `${environment.apiUrl}/v1/courses/${courseId}/assistant/conversations`;
  }

  list(courseId: string, params: Record<string, string>): Promise<AssistantConversation[]> {
    return firstValueFrom(
      this.#http.get<AssistantConversation[]>(this.base(courseId), { params }),
    );
  }

  create(courseId: string, body: Record<string, unknown>): Promise<AssistantConversation> {
    return firstValueFrom(this.#http.post<AssistantConversation>(this.base(courseId), body));
  }

  get(courseId: string, conversationId: string): Promise<AssistantConversationDetail> {
    return firstValueFrom(
      this.#http.get<AssistantConversationDetail>(`${this.base(courseId)}/${conversationId}`),
    );
  }

  rename(courseId: string, conversationId: string, title: string): Promise<AssistantConversation> {
    return firstValueFrom(
      this.#http.patch<AssistantConversation>(`${this.base(courseId)}/${conversationId}`, {
        title,
      }),
    );
  }

  delete(courseId: string, conversationId: string): Promise<void> {
    return firstValueFrom(this.#http.delete<void>(`${this.base(courseId)}/${conversationId}`));
  }

  /** Flux SSE d'un tour (envoi d'un message). */
  streamUrl(courseId: string, conversationId: string): string {
    return `${this.base(courseId)}/${conversationId}/messages/stream`;
  }

  /** Flux SSE de reprise d'un run figé (décision sur une proposition HITL). */
  decisionUrl(courseId: string, conversationId: string, toolCallId: string): string {
    return `${this.base(courseId)}/${conversationId}/proposals/${toolCallId}/decision`;
  }
}
