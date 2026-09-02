import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  AssistantContext,
  AssistantConversation,
  AssistantConversationDetail,
  AssistantMessage,
  AssistantSources,
  AssistantStreamEvent,
} from './assistant.model';
import { AssistantPendingProposal, parseProposal } from './proposals';
import { createSseParser } from './sse';

export type { AssistantPendingProposal } from './proposals';

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

/**
 * `awaiting` : le flux s'est fermé sur une proposition d'édition (événement
 * `interrupt`, flux HITL d'un contexte d'édition) — le run est figé côté back
 * jusqu'à la décision (`resumeProposal`), le composer attend.
 */
export type AssistantStreamState = 'idle' | 'streaming' | 'awaiting' | 'error';

/**
 * Portée d'une instance d'état de chat : le contexte de conversation côté back
 * (`ai_conversations.context`) et, pour les contextes d'édition, le bloc visé.
 */
export interface AssistantChatScope {
  context: AssistantContext;
  blockId?: string | null;
}

/**
 * État d'UN chat assistant (conversations + flux SSE) — la classe extraite de
 * `CourseAssistantService`, désormais instanciable par hôte : le service root
 * (`CourseAssistantService`, panneau flottant global) l'étend, et le chat
 * ancré d'un éditeur en fournit SA propre instance (`providers` du composant
 * hôte, ex. `BlockEditor`) — les deux chats coexistent sur la même page sans
 * se marcher dessus.
 *
 * Variante mutable du patron (motif `CourseService`) plus le **premier client
 * SSE du projet** : le CRUD des conversations passe par `HttpClient` (Bearer
 * automatique, URLs sous `apiUrl`), mais le flux de réponse est un `fetch` +
 * `ReadableStream` — hors du pipeline HttpClient, donc hors intercepteur
 * OIDC : l'`Authorization` est posée à la main depuis `AuthService.accessToken`
 * (seule couche qui connaît le token). Navigateur uniquement
 * (`isPlatformBrowser`), annulable (`AbortController`).
 *
 * La **portée** (`configure`) fixe le contexte des conversations : `course`
 * (défaut — comportement historique, aucun query param ni champ ajouté) ou un
 * contexte d'édition d'un bloc — `block_text`, `block_exercise` (liste
 * filtrée `?context=&block_id=`, création `{context, block_id}`). L'hôte
 * éditeur peut poser un hook `setBeforeTurn` awaité avant chaque tour ET avant
 * chaque décision HITL (flush d'autosave : le back lit le bloc EN BASE pour
 * bâtir le contexte et, à la reprise, renuméroter ce qu'une décision acceptée
 * vient d'appliquer — échec non bloquant).
 *
 * La vue d'entrée est une conversation **brouillon** (id vide, purement
 * locale) : `active` ne vaut `null` que quand l'historique est affiché ;
 * `sendMessage` matérialise le brouillon (POST) avant de streamer le premier
 * tour. État en signaux, scopé à UN cours à la fois (garde `#courseId`, motif
 * `ResourceService`), purgé à la déconnexion. Pendant un tour, les deltas
 * s'accumulent dans `streamingText`/`streamingThinking` et l'activité
 * d'outils (arguments + extrait du résultat) dans `toolActivity` ; au `done`,
 * le tour est replié en messages locaux (le serveur reste la vérité — rouvrir
 * la conversation recharge les lignes persistées, contenus d'outils complets
 * compris ; les tours `tool` locaux ne portent que l'extrait streamé).
 */
@Injectable()
export class AssistantChatState implements OnDestroy {
  readonly #http = inject(HttpClient);
  /** Exposé aux sous-classes (purge du panneau global à la déconnexion). */
  protected readonly auth = inject(AuthService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  #context: AssistantContext = 'course';
  #blockId: string | null = null;
  #beforeTurn: (() => Promise<void>) | null = null;

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
   * Proposition d'édition en attente (flux HITL des contextes d'édition, typée
   * par `parseProposal`) : posée à l'événement `interrupt` (le flux se ferme,
   * `streamState` passe à `awaiting`), consommée par `resumeProposal` —
   * l'hôte éditeur y adosse sa revue (diff/carte + décision). Purement
   * locale : un rechargement de page la perd (le back garde la reprise
   * jusqu'à son TTL, mais elle n'est pas ré-offerte — assumé, rouvrir la
   * conversation montre le round incomplet).
   */
  readonly #pendingProposal = signal<AssistantPendingProposal | null>(null);
  readonly pendingProposal = this.#pendingProposal.asReadonly();

  constructor() {
    this.#active.set(this.#draft());
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.#reset();
      }
    });
  }

  /** Instance fournie par un composant (chat ancré) : détruite avec lui — le
      flux en vol est interrompu (le back annule l'attente HITL éventuelle). */
  ngOnDestroy(): void {
    this.stopStreaming();
  }

  /**
   * Fixe la portée de l'instance — à appeler UNE fois par l'hôte, avant tout
   * chargement (le service root reste sur le défaut `course`). Le brouillon
   * d'entrée, posé à la construction, est réaligné sur la nouvelle portée.
   */
  configure(scope: AssistantChatScope): void {
    this.#context = scope.context;
    this.#blockId = scope.blockId ?? null;
    const active = this.#active();
    if (active?.id === '' && active.messages.length === 0) {
      this.#active.set(this.#draft());
    }
  }

  /**
   * Hook awaité avant chaque tour (`sendMessage`) — l'hôte éditeur y branche
   * son flush d'autosave pour que le back lise l'état courant du bloc. Un
   * échec du hook n'empêche jamais l'envoi (`null` désarme).
   */
  setBeforeTurn(hook: (() => Promise<void>) | null): void {
    this.#beforeTurn = hook;
  }

  /**
   * Conversation **brouillon** : la vue d'entrée est une conversation vide
   * purement locale (`id` vide — jamais un id serveur), matérialisée côté
   * back seulement au premier message envoyé. Un brouillon jamais utilisé ne
   * crée donc rien en base ; les dates sont des placeholders jamais affichés.
   */
  #draft(): AssistantConversationDetail {
    const now = new Date().toISOString();
    return {
      id: '',
      context: this.#context,
      block_id: this.#blockId,
      module_id: null,
      title: null,
      created_at: now,
      updated_at: now,
      messages: [],
    };
  }

  #reset(): void {
    this.stopStreaming();
    this.#courseId = null;
    this.#conversations.set(null);
    this.#active.set(this.#draft());
    this.#listError.set(false);
    this.#activeError.set(false);
    this.#streamState.set('idle');
    this.#streamErrorStatus.set(null);
    this.#streamingText.set('');
    this.#streamingThinking.set('');
    this.#toolActivity.set([]);
    this.#pendingProposal.set(null);
  }

  #base(courseId: string): string {
    return `${environment.apiUrl}/v1/courses/${courseId}/assistant/conversations`;
  }

  /**
   * Query params de la liste : aucun en portée `course` (défaut du back —
   * URL historique inchangée), contexte + bloc en portée d'édition.
   */
  #listParams(): Record<string, string> {
    if (this.#context === 'course') {
      return {};
    }
    const params: Record<string, string> = { context: this.#context };
    if (this.#blockId) {
      params['block_id'] = this.#blockId;
    }
    return params;
  }

  /** Charge la liste des conversations de la portée pour un cours. */
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
        this.#http.get<AssistantConversation[]>(this.#base(courseId), {
          params: this.#listParams(),
        }),
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

  /**
   * Ouvre une conversation vide — purement LOCALE (brouillon) : rien n'est
   * créé côté serveur avant le premier message (`sendMessage` matérialise).
   */
  startNewConversation(): void {
    this.stopStreaming();
    this.#active.set(this.#draft());
    this.#clearTurn();
  }

  /**
   * Matérialise le brouillon actif côté serveur (POST) au premier message.
   * `null` si le POST échoue (état d'erreur posé) ou si le contexte a changé
   * pendant l'aller-retour (autre cours, autre conversation ouverte).
   */
  async #createConversation(courseId: string): Promise<AssistantConversation | null> {
    const body: Record<string, unknown> = { context: this.#context };
    if (this.#context !== 'course' && this.#blockId) {
      body['block_id'] = this.#blockId;
    }
    try {
      const created = await firstValueFrom(
        this.#http.post<AssistantConversation>(this.#base(courseId), body),
      );
      if (this.#courseId !== courseId || this.#active()?.id !== '') {
        return null;
      }
      this.#conversations.update((list) => [created, ...(list ?? [])]);
      this.#active.update((detail) =>
        detail ? { ...detail, ...created, messages: detail.messages } : detail,
      );
      return created;
    } catch (error) {
      this.#failStream(error instanceof HttpErrorResponse ? error.status : 0);
      return null;
    }
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

  /** Referme la conversation active (affiche l'historique des conversations). */
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
   *
   * Sur un brouillon (`id` vide), la conversation est d'abord matérialisée
   * côté serveur — c'est le SEUL point de création : un brouillon sans message
   * n'existe jamais en base. Le hook `beforeTurn` (flush d'autosave de
   * l'hôte) est awaité APRÈS le passage en `streaming` (double-envoi bloqué)
   * et AVANT tout appel réseau du tour.
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

    if (this.#beforeTurn) {
      try {
        await this.#beforeTurn();
      } catch {
        // Non bloquant : l'IA travaillera sur le dernier état persisté (le
        // badge d'erreur d'autosave de l'éditeur signale déjà le problème).
      }
    }

    let conversationId = conversation.id;
    if (!conversationId) {
      const created = await this.#createConversation(courseId);
      if (!created) {
        // Échec (état d'erreur posé) ou contexte changé pendant le POST : le
        // message reste affiché en local, rien n'est streamé.
        return;
      }
      conversationId = created.id;
    }

    const status = await this.#streamTurn(
      `${this.#base(courseId)}/${conversationId}/messages/stream`,
      { content: trimmed },
    );
    if (status !== null) {
      this.#failStream(status);
    }
  }

  /**
   * Décision du professeur sur la proposition en attente (flux HITL) :
   * REPREND le run figé côté back — la réponse est le **flux SSE de la suite
   * du tour** (`tool_result`… `done`, ou un nouvel `interrupt` si le modèle
   * re-propose après un rejet commenté). La proposition locale est consommée
   * dès l'ouverture du flux ; sur échec d'envoi elle reste en place
   * (réessayable), sauf 404 — reprise disparue côté back (expirée,
   * redémarrage). Retourne `false` si le flux n'a pas pu s'ouvrir.
   *
   * Le hook `beforeTurn` (flush d'autosave) est awaité AVANT le POST : une
   * décision acceptée vient d'être appliquée dans l'éditeur, et la reprise
   * recharge le bloc EN BASE (relecture par le modèle, renumérotation des
   * questions d'un exercice) — sans flush, elle travaillerait sur l'état
   * d'avant l'application.
   */
  async resumeProposal(decision: { accepted: boolean; comment?: string }): Promise<boolean> {
    const courseId = this.#courseId;
    const conversationId = this.#active()?.id;
    const pending = this.#pendingProposal();
    if (!courseId || !conversationId || !pending || !this.#isBrowser) {
      return false;
    }
    if (this.#streamState() === 'streaming') {
      return false;
    }
    this.#streamState.set('streaming');
    this.#streamErrorStatus.set(null);
    if (this.#beforeTurn) {
      try {
        await this.#beforeTurn();
      } catch {
        // Non bloquant (même règle que sendMessage).
      }
    }
    const status = await this.#streamTurn(
      `${this.#base(courseId)}/${conversationId}/proposals/${pending.id}/decision`,
      { accepted: decision.accepted, comment: decision.comment ?? null },
      () => this.#pendingProposal.set(null),
    );
    if (status !== null) {
      if (status === 404) {
        this.#pendingProposal.set(null);
      }
      this.#failStream(status);
      return false;
    }
    return true;
  }

  /**
   * POST + consommation d'un flux SSE de tour (envoi de message ou reprise
   * HITL) : Bearer posé à la main (doc de classe), abort partagé, repli du
   * partiel sur coupure. Retourne le status HTTP d'une réponse non-2xx (flux
   * jamais ouvert — l'appelant décide), `null` sinon (flux consommé ou abort,
   * états déjà posés). `onOpen` est appelé dès la réponse 2xx, avant lecture.
   */
  async #streamTurn(url: string, body: unknown, onOpen?: () => void): Promise<number | null> {
    const abort = new AbortController();
    this.#abort = abort;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.auth.accessToken}`,
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!response.ok || response.body === null) {
        return response.status;
      }
      onOpen?.();
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
      return null;
    } catch {
      if (abort.signal.aborted) {
        // Stop volontaire : le partiel affiché devient un message local.
        this.#finalizeTurn(null, null);
        this.#streamState.set('idle');
      } else {
        this.#finalizeTurn(null, null);
        this.#failStream(0);
      }
      return null;
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
      case 'interrupt': {
        // Proposition d'édition (HITL) : le run est figé côté back, le flux
        // se ferme — la revue (diff/carte + décision, hôte éditeur) s'adosse
        // à `pendingProposal` (typée par `parseProposal` depuis l'appel figé
        // de l'activité d'outils) ; le tour reste affiché en l'état (activité
        // d'outils comprise), il reprendra via `resumeProposal`.
        const entry = this.#toolActivity().find((e) => e.id === event.tool_call_id);
        const proposal = entry ? parseProposal(entry) : null;
        if (proposal !== null) {
          this.#pendingProposal.set(proposal);
          this.#streamState.set('awaiting');
        } else {
          // Défensif (le back valide avant de figer) : rien à revoir.
          this.#finalizeTurn(null, null);
          this.#streamState.set('idle');
        }
        return true;
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
    // Nouvelle vue/nouveau tour : une proposition encore en attente est
    // abandonnée localement (le back purge la sienne au prochain message,
    // ou à son TTL).
    this.#pendingProposal.set(null);
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
