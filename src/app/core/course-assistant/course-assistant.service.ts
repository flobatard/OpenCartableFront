import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  AssistantConversation,
  AssistantConversationDetail,
  AssistantMessage,
  AssistantSources,
  AssistantStreamEvent,
} from './assistant.model';
import { createSseParser } from './sse';

/** Activité d'outil du tour en cours (affichage live du panneau). */
export interface AssistantToolActivity {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  /** Arguments de l'appel, tels qu'émis par le modèle (événement `tool_call`). */
  args: Record<string, unknown>;
  /**
   * Extrait du résultat (`excerpt` du flux, suivi de « … » s'il est tronqué) —
   * message d'échec complet en cas d'erreur ; `null` tant que l'outil tourne.
   */
  result: string | null;
}

export type AssistantStreamState = 'idle' | 'streaming' | 'error';

/**
 * Assistant IA d'un cours — variante mutable du patron (motif `CourseService`)
 * plus le **premier client SSE du projet** : le CRUD des conversations passe
 * par `HttpClient` (Bearer automatique, URLs sous `apiUrl`), mais le flux de
 * réponse est un `fetch` + `ReadableStream` — hors du pipeline HttpClient,
 * donc hors intercepteur OIDC : l'`Authorization` est posée à la main depuis
 * `AuthService.accessToken` (seule couche qui connaît le token). Navigateur
 * uniquement (`isPlatformBrowser`), annulable (`AbortController`).
 *
 * État en signaux, scopé à UN cours à la fois (garde `#courseId`, motif
 * `ResourceService`), purgé à la déconnexion. Pendant un tour, les deltas
 * s'accumulent dans `streamingText`/`streamingThinking` et l'activité
 * d'outils (arguments + extrait du résultat) dans `toolActivity` ; au `done`,
 * le tour est replié en messages locaux (le serveur reste la vérité — rouvrir
 * la conversation recharge les lignes persistées, contenus d'outils complets
 * compris ; les tours `tool` locaux ne portent que l'extrait streamé).
 */
@Injectable({ providedIn: 'root' })
export class CourseAssistantService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  #courseId: string | null = null;
  #abort: AbortController | null = null;
  #localSequence = 0;

  readonly #conversations = signal<AssistantConversation[] | null>(null);
  readonly conversations = this.#conversations.asReadonly();
  readonly #listLoading = signal(false);
  readonly listLoading = this.#listLoading.asReadonly();
  readonly #listError = signal(false);
  readonly listError = this.#listError.asReadonly();

  readonly #active = signal<AssistantConversationDetail | null>(null);
  readonly active = this.#active.asReadonly();
  readonly #activeLoading = signal(false);
  readonly activeLoading = this.#activeLoading.asReadonly();
  readonly #activeError = signal(false);
  readonly activeError = this.#activeError.asReadonly();

  readonly #streamState = signal<AssistantStreamState>('idle');
  readonly streamState = this.#streamState.asReadonly();
  readonly #streamErrorStatus = signal<number | null>(null);
  readonly streamErrorStatus = this.#streamErrorStatus.asReadonly();
  readonly #streamingText = signal('');
  readonly streamingText = this.#streamingText.asReadonly();
  readonly #streamingThinking = signal('');
  readonly streamingThinking = this.#streamingThinking.asReadonly();
  readonly #toolActivity = signal<AssistantToolActivity[]>([]);
  readonly toolActivity = this.#toolActivity.asReadonly();

  /**
   * État déplié/replié du panneau assistant, PARTAGÉ par tous ses hôtes
   * (pilule flottante de la page cours, chat ancré des éditeurs) : l'assistant
   * ouvert reste ouvert quand l'utilisateur navigue — notamment en suivant une
   * citation `oc-block:` vers l'éditeur du bloc cité. Volontairement hors de
   * `#reset` : changer de cours ne referme pas le panneau.
   */
  readonly #panelOpen = signal(false);
  readonly panelOpen = this.#panelOpen.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#reset();
        this.#panelOpen.set(false);
      }
    });
  }

  setPanelOpen(open: boolean): void {
    this.#panelOpen.set(open);
  }

  #reset(): void {
    this.stopStreaming();
    this.#courseId = null;
    this.#conversations.set(null);
    this.#active.set(null);
    this.#listError.set(false);
    this.#activeError.set(false);
    this.#streamState.set('idle');
    this.#streamErrorStatus.set(null);
    this.#streamingText.set('');
    this.#streamingThinking.set('');
    this.#toolActivity.set([]);
  }

  #base(courseId: string): string {
    return `${environment.apiUrl}/v1/courses/${courseId}/assistant/conversations`;
  }

  /** Charge la liste des conversations du contexte global d'un cours. */
  async loadConversations(courseId: string): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    if (this.#courseId !== courseId) {
      this.#reset();
      this.#courseId = courseId;
    }
    this.#listLoading.set(true);
    this.#listError.set(false);
    try {
      const list = await firstValueFrom(
        this.#http.get<AssistantConversation[]>(this.#base(courseId)),
      );
      if (this.#courseId === courseId) {
        this.#conversations.set(list);
      }
    } catch {
      this.#listError.set(true);
    } finally {
      this.#listLoading.set(false);
    }
  }

  /** Crée une conversation vide et l'ouvre. */
  async createConversation(): Promise<void> {
    const courseId = this.#courseId;
    if (!courseId) {
      return;
    }
    const conversation = await firstValueFrom(
      this.#http.post<AssistantConversation>(this.#base(courseId), { context: 'course' }),
    );
    this.#conversations.update((list) => [conversation, ...(list ?? [])]);
    this.#active.set({ ...conversation, messages: [] });
    this.#clearTurn();
  }

  /** Ouvre une conversation existante (recharge ses messages persistés). */
  async openConversation(conversationId: string): Promise<void> {
    const courseId = this.#courseId;
    if (!courseId) {
      return;
    }
    this.stopStreaming();
    this.#activeLoading.set(true);
    this.#activeError.set(false);
    this.#clearTurn();
    try {
      const detail = await firstValueFrom(
        this.#http.get<AssistantConversationDetail>(`${this.#base(courseId)}/${conversationId}`),
      );
      if (this.#courseId === courseId) {
        this.#active.set(detail);
      }
    } catch {
      this.#activeError.set(true);
    } finally {
      this.#activeLoading.set(false);
    }
  }

  /** Referme la conversation active (retour à la liste). */
  closeConversation(): void {
    this.stopStreaming();
    this.#active.set(null);
    this.#clearTurn();
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const courseId = this.#courseId;
    if (!courseId) {
      return;
    }
    const updated = await firstValueFrom(
      this.#http.patch<AssistantConversation>(`${this.#base(courseId)}/${conversationId}`, {
        title,
      }),
    );
    this.#patchConversation(updated);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const courseId = this.#courseId;
    if (!courseId) {
      return;
    }
    await firstValueFrom(this.#http.delete<void>(`${this.#base(courseId)}/${conversationId}`));
    this.#conversations.update((list) => (list ?? []).filter((c) => c.id !== conversationId));
    if (this.#active()?.id === conversationId) {
      this.closeConversation();
    }
  }

  /** Interrompt le flux en cours (bouton Stop, destroy, changement de vue). */
  stopStreaming(): void {
    this.#abort?.abort();
    this.#abort = null;
  }

  /**
   * Envoie un message et consomme le flux SSE de la réponse.
   *
   * `fetch` sort du pipeline HttpClient : Bearer posé à la main (voir doc de
   * classe). Une réponse non-2xx (404/422/429/503 eager) est lue en JSON
   * FastAPI et devient l'état d'erreur ; les erreurs mid-stream arrivent en
   * événement `error` du flux. Un abort conserve le texte partiel affiché.
   */
  async sendMessage(content: string): Promise<void> {
    const courseId = this.#courseId;
    const conversation = this.#active();
    const trimmed = content.trim();
    if (!courseId || !conversation || !trimmed || !this.#isBrowser) {
      return;
    }
    if (this.#streamState() === 'streaming') {
      return;
    }

    this.#appendMessage({ role: 'user', content: trimmed });
    this.#clearTurn();
    this.#streamState.set('streaming');
    const abort = new AbortController();
    this.#abort = abort;

    try {
      const response = await fetch(`${this.#base(courseId)}/${conversation.id}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.#auth.accessToken}`,
        },
        body: JSON.stringify({ content: trimmed }),
        signal: abort.signal,
      });
      if (!response.ok || response.body === null) {
        this.#failStream(response.status);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();
      let closed = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          closed = this.#handleEvent(event) || closed;
        }
      }
      if (!closed) {
        // Flux coupé sans done/error (proxy, réseau) : replier le partiel.
        this.#finalizeTurn(null, null);
        this.#failStream(0);
      }
    } catch {
      if (abort.signal.aborted) {
        // Stop volontaire : le partiel affiché devient un message local.
        this.#finalizeTurn(null, null);
        this.#streamState.set('idle');
      } else {
        this.#finalizeTurn(null, null);
        this.#failStream(0);
      }
    } finally {
      if (this.#abort === abort) {
        this.#abort = null;
      }
    }
  }

  /** Traite un événement du flux ; `true` si le flux est clos (done/error). */
  #handleEvent(event: AssistantStreamEvent): boolean {
    switch (event.type) {
      case 'token':
        this.#streamingText.update((text) => text + event.delta);
        return false;
      case 'thinking':
        this.#streamingThinking.update((text) => text + event.delta);
        return false;
      case 'tool_call':
        this.#toolActivity.update((activity) => [
          ...activity,
          {
            id: event.id,
            name: event.name,
            status: 'running',
            args: event.args ?? {},
            result: null,
          },
        ]);
        return false;
      case 'tool_result': {
        // Contrat additif : un back plus ancien n'envoie ni excerpt ni length.
        const excerpt = event.excerpt ?? '';
        const truncated = (event.length ?? excerpt.length) > excerpt.length;
        this.#toolActivity.update((activity) =>
          activity.map((entry) =>
            entry.id === event.id
              ? {
                  ...entry,
                  status: event.is_error ? 'error' : 'done',
                  result: excerpt ? excerpt + (truncated ? '…' : '') : null,
                }
              : entry,
          ),
        );
        return false;
      }
      case 'done':
        this.#finalizeTurn(event.sources, event.title);
        this.#streamState.set('idle');
        return true;
      case 'error':
        this.#finalizeTurn(null, null);
        this.#failStream(event.status);
        return true;
    }
  }

  /**
   * Replie le tour streamé en messages locaux : l'activité d'outils devient
   * des tours `tool` (contenu = l'extrait streamé, jamais le résultat
   * complet), le texte accumulé le message assistant final. Le serveur reste
   * la vérité (rouvrir recharge).
   */
  #finalizeTurn(sources: AssistantSources | null, title: string | null): void {
    const activity = this.#toolActivity();
    for (const entry of activity) {
      this.#appendMessage({
        role: 'tool',
        content: entry.result ?? '',
        tool_call_id: entry.id,
        is_error: entry.status === 'error',
      });
    }
    const text = this.#streamingText();
    if (text || activity.length > 0) {
      // Même forme que les lignes serveur : l'assistant porte les tool_calls
      // (le fil rend l'activité depuis eux, l'is_error depuis les tours tool).
      this.#appendMessage({
        role: 'assistant',
        content: text,
        tool_calls: activity.map((entry) => ({
          id: entry.id,
          name: entry.name,
          arguments: entry.args,
        })),
        sources: sources ?? {},
      });
    }
    const active = this.#active();
    if (active) {
      const now = new Date().toISOString();
      const updated: AssistantConversation = {
        ...active,
        title: title ?? active.title,
        updated_at: now,
      };
      this.#active.update((detail) =>
        detail ? { ...detail, title: updated.title, updated_at: now } : detail,
      );
      this.#patchConversation(updated);
    }
    this.#streamingText.set('');
    this.#streamingThinking.set('');
  }

  #failStream(status: number): void {
    this.#streamState.set('error');
    this.#streamErrorStatus.set(status);
  }

  #clearTurn(): void {
    this.#streamingText.set('');
    this.#streamingThinking.set('');
    this.#toolActivity.set([]);
    this.#streamState.set('idle');
    this.#streamErrorStatus.set(null);
  }

  #appendMessage(
    partial: Partial<AssistantMessage> & Pick<AssistantMessage, 'role' | 'content'>,
  ): void {
    this.#active.update((detail) => {
      if (!detail) {
        return detail;
      }
      const message: AssistantMessage = {
        id: `local-${this.#localSequence++}`,
        position: detail.messages.length,
        tool_calls: [],
        tool_call_id: null,
        is_error: false,
        sources: {},
        input_tokens: null,
        output_tokens: null,
        created_at: new Date().toISOString(),
        ...partial,
      };
      return { ...detail, messages: [...detail.messages, message] };
    });
  }

  #patchConversation(updated: AssistantConversation): void {
    this.#conversations.update((list) => {
      const rest = (list ?? []).filter((c) => c.id !== updated.id);
      return [updated, ...rest];
    });
  }
}
