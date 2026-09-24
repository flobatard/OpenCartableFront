import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthService } from '../auth/auth.service';
import {
  AssistantContext,
  AssistantConversation,
  AssistantConversationDetail,
  AssistantMessage,
  AssistantSources,
  AssistantStreamEvent,
  AssistantUsage,
} from './assistant.model';
import {
  Attachment,
  AttachmentKind,
  ATTACHMENT_MAX_BYTES,
  attachmentKindOf,
  attachmentMimeOf,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from './attachment.model';
import { AssistantAttachmentsService } from './attachments.service';
import { AssistantConversationsApi } from './conversations-api';
import { downscaleImage } from './image-downscale';
import { DELEGATION_TOOLS, parseDelegation } from './delegation';
import { AssistantPendingProposal, parseProposal } from './proposals';
import {
  ASK_QUESTIONS,
  AssistantPendingQuestions,
  parseQuestions,
  pendingQuestionsFromHistory,
  QuestionsReply,
  questionsReplyBody,
} from './questions';
import { postSseStream } from './sse';
import {
  applyAgentToken,
  applyToolResult,
  AssistantToolActivity,
  foldTurnMessages,
  LocalMessage,
  toolActivityFromCall,
  toolRowFromResult,
} from './turn-reducer';
import { addUsage } from './usage';

export type { AssistantPendingProposal } from './proposals';
export type { AssistantPendingQuestions } from './questions';
export type { AssistantToolActivity } from './turn-reducer';

/**
 * `awaiting` : le flux s'est fermé sur un tool bloquant (événement
 * `interrupt`, flux HITL) — le run est figé côté back jusqu'à la réponse du
 * professeur : décision sur une proposition d'édition (`resumeProposal`, le
 * composer attend) ou réponse à des questions (`answerQuestions`, le
 * formulaire des questions remplace le composer).
 */
export type AssistantStreamState = 'idle' | 'streaming' | 'awaiting' | 'error';

/**
 * Pièce jointe du composer, du choix du fichier à son envoi. `uploading` et
 * `error` ne valent que localement : seule une pièce `ready` porte un `id`
 * serveur et part avec le message.
 */
export interface DraftAttachment {
  /** Clé locale stable (le temps de l'upload), puis id serveur une fois prêt. */
  key: string;
  id: string | null;
  name: string;
  kind: AttachmentKind;
  size: number;
  phase: 'uploading' | 'ready' | 'error';
  progress: number;
}

/** Pourquoi un fichier a été refusé avant même le presign. */
export type AttachmentRejection = 'unsupported' | 'tooLarge' | 'tooMany';

/**
 * Portée d'une instance d'état de chat : le contexte de conversation côté back
 * (`ai_conversations.context`) et, pour les contextes d'édition, la cible
 * visée — un bloc (`block_text`/`block_exercise`) ou un module (`module`).
 */
export interface AssistantChatScope {
  context: AssistantContext;
  blockId?: string | null;
  moduleId?: string | null;
}

/**
 * État d'UN chat assistant (conversations + flux SSE), instanciable par hôte :
 * le service root (`CourseAssistantService`, panneau flottant global) l'étend,
 * et le chat ancré d'un éditeur en fournit SA propre instance (`providers` du
 * composant hôte) — les deux chats coexistent sur la même page.
 *
 * Portée (`configure`) : contexte `course` (défaut — aucun query param ni
 * champ ajouté) ou contexte d'édition scopé à sa cible (bloc ou module) ;
 * l'hôte éditeur peut poser un hook `setBeforeTurn` awaité avant chaque tour
 * ET chaque reprise HITL (flush d'autosave : le back lit la cible EN BASE).
 * La vue d'entrée est une conversation **brouillon** (id vide, locale) :
 * `active` ne vaut `null` que quand l'historique est affiché ; `sendMessage`
 * matérialise le brouillon (POST) avant de streamer le premier tour. Pendant
 * un tour, les deltas s'accumulent dans `streamingText`/`streamingThinking`
 * et l'activité d'outils dans `toolActivity` ; à la clôture, le tour est
 * replié en messages locaux (`turn-reducer`), l'usage de tokens cumulé sur
 * ses événements (`interrupt`(s) puis `done`) posé sur le message assistant —
 * le serveur reste la vérité (rouvrir recharge les lignes persistées,
 * contenus d'outils complets).
 * CRUD via `AssistantConversationsApi` (HttpClient), flux via `postSseStream`
 * (fetch, Bearer à la main) ; navigateur uniquement, annulable, scopé à UN
 * cours (`#courseId`), purgé à la déconnexion.
 */
@Injectable()
export class AssistantChatState implements OnDestroy {
  readonly #api = inject(AssistantConversationsApi);
  readonly #attachments = inject(AssistantAttachmentsService);
  /** Exposé aux sous-classes (purge du panneau global à la déconnexion). */
  protected readonly auth = inject(AuthService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #analytics = inject(AnalyticsService);

  #context: AssistantContext = 'course';
  #blockId: string | null = null;
  #moduleId: string | null = null;
  #beforeTurn: (() => Promise<void>) | null = null;

  #courseId: string | null = null;
  #abort: AbortController | null = null;
  #localSequence = 0;
  /**
   * Usage du tour en cours, cumulé au fil des événements qui en portent :
   * `interrupt` (rounds déjà joués du run figé — plusieurs si le modèle
   * re-propose après un rejet) puis `done` (rounds de la reprise, repartis de
   * zéro côté back). Posé sur le message assistant replié, jamais rendu seul.
   */
  #turnUsage: AssistantUsage | null = null;

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
   * jusqu'à son TTL, mais elle n'est pas ré-offerte — cf. TODO.md).
   */
  readonly #pendingProposal = signal<AssistantPendingProposal | null>(null);
  readonly pendingProposal = this.#pendingProposal.asReadonly();

  /**
   * Questions de l'assistant en attente de réponse (tool `ask_questions`, tous
   * contextes, typées par `parseQuestions`) : posées à l'événement `interrupt`
   * — ou reproposées à la réouverture d'une conversation dont elles restent le
   * dernier appel sans réponse —, consommées par `answerQuestions`. Distinctes
   * de `pendingProposal` : la revue et le mode « édition auto » ne les voient
   * jamais.
   */
  readonly #pendingQuestions = signal<AssistantPendingQuestions | null>(null);
  readonly pendingQuestions = this.#pendingQuestions.asReadonly();

  /**
   * Des questions n'attendaient plus côté back au moment d'y répondre (404 :
   * délai dépassé, redémarrage) : le fil l'affiche jusqu'au prochain tour ou
   * changement de vue. Leurs ids ne sont plus reproposés par cette instance.
   */
  readonly #questionsExpired = signal(false);
  readonly questionsExpired = this.#questionsExpired.asReadonly();
  readonly #expiredQuestionIds = new Set<string>();

  /**
   * Pièces jointes préparées pour le PROCHAIN message : uploadées en S3 dès
   * qu'on les choisit (le back les rattache au message à l'envoi), retirables
   * tant qu'elles n'ont pas été envoyées. Vidées au changement de
   * conversation, jamais par `#clearTurn` — un nouveau tour dans la même
   * conversation les a déjà consommées.
   */
  readonly #draftAttachments = signal<DraftAttachment[]>([]);
  readonly draftAttachments = this.#draftAttachments.asReadonly();

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
    this.#moduleId = scope.moduleId ?? null;
    const active = this.#active();
    if (active?.id === '' && active.messages.length === 0) {
      this.#active.set(this.#draft());
    }
  }

  /**
   * Hook awaité avant chaque tour (`sendMessage`) et chaque reprise HITL
   * (`resumeProposal`, `answerQuestions`) — l'hôte éditeur y branche son flush
   * d'autosave. Un échec du hook n'empêche jamais l'envoi (`null` désarme).
   */
  setBeforeTurn(hook: (() => Promise<void>) | null): void {
    this.#beforeTurn = hook;
  }

  /**
   * Options ajoutées au corps de chaque message envoyé (relues à l'envoi) :
   * rien par défaut ; le service root y pose l'édition globale du panneau
   * flottant (`allow_edit`).
   */
  protected turnOptions(): Record<string, unknown> {
    return {};
  }

  /** Cours de la portée courante (`loadConversations`) ; `null` avant tout chargement. */
  protected currentCourseId(): string | null {
    return this.#courseId;
  }

  /**
   * Conversation **brouillon** : vue d'entrée vide, purement locale (`id`
   * vide — jamais un id serveur), matérialisée côté back seulement au premier
   * message envoyé. Les dates sont des placeholders jamais affichés.
   */
  #draft(): AssistantConversationDetail {
    const now = new Date().toISOString();
    return {
      id: '',
      context: this.#context,
      block_id: this.#blockId,
      module_id: this.#moduleId,
      title: null,
      created_at: now,
      updated_at: now,
      messages: [],
    };
  }

  #reset(): void {
    this.stopStreaming();
    // AVANT de perdre le courseId : c'est lui qui permet de supprimer côté
    // serveur les pièces jointes préparées et jamais envoyées.
    this.#discardDraftAttachments();
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
    this.#turnUsage = null;
    this.#pendingProposal.set(null);
    this.#pendingQuestions.set(null);
    this.#questionsExpired.set(false);
    this.#expiredQuestionIds.clear();
  }

  /**
   * Abandonne les pièces jointes préparées mais jamais envoyées (changement de
   * conversation ou de vue, déconnexion).
   *
   * Les pièces déjà uploadées sont **aussi supprimées côté serveur**, sans
   * attendre le résultat : une navigation ne doit jamais bloquer dessus. Le
   * job de maintenance `ai_attachments` reste le filet (échec réseau, onglet
   * fermé), mais il ne passe qu'une fois par jour avec 7 jours de rétention —
   * sans ce ménage, chaque brouillon abandonné laisserait un objet S3 payé
   * une semaine.
   */
  #discardDraftAttachments(): void {
    const courseId = this.#courseId;
    const abandoned = this.#draftAttachments();
    this.#draftAttachments.set([]);
    if (!courseId) {
      return;
    }
    for (const attachment of abandoned) {
      if (attachment.id) {
        void this.#attachments.remove(courseId, attachment.id).catch(() => {
          // Le filet de maintenance ramassera : rien à signaler au professeur.
        });
      }
    }
  }

  /** Query params de la liste : aucun en portée `course`, contexte + cible sinon. */
  #listParams(): Record<string, string> {
    if (this.#context === 'course') {
      return {};
    }
    const params: Record<string, string> = { context: this.#context };
    if (this.#blockId) {
      params['block_id'] = this.#blockId;
    }
    if (this.#moduleId) {
      params['module_id'] = this.#moduleId;
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
      const list = await this.#api.list(courseId, this.#listParams());
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
    this.#discardDraftAttachments();
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
    if (this.#context !== 'course' && this.#moduleId) {
      body['module_id'] = this.#moduleId;
    }
    try {
      const created = await this.#api.create(courseId, body);
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

  /**
   * Ouvre une conversation existante (recharge ses messages persistés). Si
   * elle se termine sur des questions de l'assistant restées sans réponse,
   * elles sont reproposées : le run attend peut-être encore côté back (sinon
   * la réponse recevra un 404 — questions expirées).
   */
  async openConversation(conversationId: string): Promise<void> {
    const courseId = this.#courseId;
    if (!courseId) {
      return;
    }
    this.stopStreaming();
    this.#activeLoading.set(true);
    this.#activeError.set(false);
    this.#clearTurn();
    this.#discardDraftAttachments();
    try {
      const detail = await this.#api.get(courseId, conversationId);
      if (this.#courseId === courseId) {
        this.#active.set(detail);
        this.#reofferQuestions(detail);
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
    this.#discardDraftAttachments();
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const courseId = this.#courseId;
    if (!courseId) {
      return;
    }
    this.#patchConversation(await this.#api.rename(courseId, conversationId, title));
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const courseId = this.#courseId;
    if (!courseId) {
      return;
    }
    await this.#api.delete(courseId, conversationId);
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
   * Envoie un message et consomme le flux SSE de la réponse. Une réponse
   * non-2xx (404/422/429/503 eager) devient l'état d'erreur ; les erreurs
   * mid-stream arrivent en événement `error` du flux. Un abort conserve le
   * texte partiel affiché.
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

    // Seules les pièces prêtes partent : une qui a échoué reste au composer,
    // le professeur la retire ou la rejoue.
    const attachments = this.#draftAttachments().filter((a) => a.phase === 'ready');
    const attachmentIds = attachments.map((a) => a.id!).filter(Boolean);

    this.#appendMessage({
      role: 'user',
      content: trimmed,
      attachments: attachments.map((a) => this.#localAttachment(a)),
    });
    this.#clearTurn();
    this.#streamState.set('streaming');
    const options = this.turnOptions();
    // Le contexte du chat, le mode et un COMPTE : ni la demande du prof, ni un
    // nom de fichier ne sortent d'ici.
    this.#analytics.capture('assistant_message_sent', {
      context: this.#context,
      allowEdit: options['allow_edit'] === true,
      attachments: attachmentIds.length,
    });
    if (this.#beforeTurn) {
      await this.#runBeforeTurn(this.#beforeTurn);
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

    // Les brouillons ne sont vidés qu'une fois le tour parti : si le POST de
    // matérialisation échoue au-dessus, ils restent joints et réessayables.
    this.#draftAttachments.set([]);
    const status = await this.#streamTurn(this.#api.streamUrl(courseId, conversationId), {
      content: trimmed,
      ...options,
      ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
    });
    if (status !== null) {
      this.#failStream(status);
    }
  }

  /**
   * Joint des fichiers au prochain message : validation locale (whitelist et
   * plafond de la famille, nombre), puis upload immédiat en S3 — le back
   * rattachera à l'envoi. Retourne les refus, à afficher par l'hôte.
   *
   * Le mime est déduit de l'extension quand le navigateur ne sait pas typer
   * le fichier : le `Content-Type` du PUT est figé dans la signature du
   * presign, se tromper ferait échouer l'upload sur S3.
   */
  async attachFiles(files: File[]): Promise<AttachmentRejection[]> {
    const courseId = this.#courseId;
    if (!courseId || !this.#isBrowser) {
      return [];
    }
    const rejections: AttachmentRejection[] = [];
    const accepted: { file: File; mime: string; kind: AttachmentKind }[] = [];
    for (const file of files) {
      if (this.#draftAttachments().length + accepted.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        rejections.push('tooMany');
        continue;
      }
      let candidate = file;
      let mime = attachmentMimeOf(candidate);
      let kind = mime ? attachmentKindOf(mime) : null;
      if (!mime || !kind) {
        rejections.push('unsupported');
        continue;
      }
      // Une photo de tableau pèse couramment plus que le plafond : on la
      // réduit AVANT de refuser — le back, lui, ne redimensionne rien.
      if (kind === 'image' && candidate.size > ATTACHMENT_MAX_BYTES.image) {
        candidate = await downscaleImage(candidate, ATTACHMENT_MAX_BYTES.image);
        // Le format produit peut différer (repli PNG) : on re-déduit tout.
        mime = attachmentMimeOf(candidate);
        kind = mime ? attachmentKindOf(mime) : null;
        if (!mime || !kind) {
          rejections.push('unsupported');
          continue;
        }
      }
      if (candidate.size > ATTACHMENT_MAX_BYTES[kind]) {
        rejections.push('tooLarge');
        continue;
      }
      accepted.push({ file: candidate, mime, kind });
    }

    await Promise.all(
      accepted.map(({ file, mime, kind }) => this.#uploadDraft(courseId, file, mime, kind)),
    );
    return rejections;
  }

  /**
   * Retire une pièce jointe du composer. Une pièce déjà uploadée est aussi
   * supprimée côté serveur (ligne + objet S3) ; l'échec de cet appel ne bloque
   * pas le retrait local — le job de maintenance ramassera.
   */
  async removeAttachment(key: string): Promise<void> {
    const attachment = this.#draftAttachments().find((a) => a.key === key);
    this.#draftAttachments.update((list) => list.filter((a) => a.key !== key));
    const courseId = this.#courseId;
    if (!attachment?.id || !courseId) {
      return;
    }
    try {
      await this.#attachments.remove(courseId, attachment.id);
    } catch {
      // Silencieux : la pièce a disparu du composer, c'est ce qui compte.
    }
  }

  async #uploadDraft(
    courseId: string,
    file: File,
    mime: string,
    kind: AttachmentKind,
  ): Promise<void> {
    const key = `draft-${this.#localSequence++}`;
    this.#draftAttachments.update((list) => [
      ...list,
      { key, id: null, name: file.name, kind, size: file.size, phase: 'uploading', progress: 0 },
    ]);
    const patch = (patchValues: Partial<DraftAttachment>) =>
      this.#draftAttachments.update((list) =>
        list.map((a) => (a.key === key ? { ...a, ...patchValues } : a)),
      );
    try {
      const uploaded = await this.#attachments.upload(courseId, file, mime, (progress) =>
        patch({ progress }),
      );
      patch({ id: uploaded.id, phase: 'ready', progress: 100 });
      // Famille seulement : jamais le nom du fichier ni sa taille exacte.
      this.#analytics.capture('assistant_attachment_added', { kind });
    } catch {
      patch({ phase: 'error' });
    }
  }

  /** Vue « pièce jointe du fil » d'un brouillon envoyé (bulle optimiste). */
  #localAttachment(draft: DraftAttachment): Attachment {
    return {
      id: draft.id!,
      original_name: draft.name,
      mime: '',
      kind: draft.kind,
      size: draft.size,
      status: 'available',
      created_at: new Date().toISOString(),
    };
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
   * Le hook `beforeTurn` est awaité AVANT le POST : une décision acceptée
   * vient d'être appliquée dans l'éditeur, et la reprise recharge le bloc EN
   * BASE — sans flush, elle travaillerait sur l'état d'avant l'application.
   */
  async resumeProposal(decision: {
    accepted: boolean;
    comment?: string;
    /** Décision prise par le mode « édition auto » (mesure seulement). */
    auto?: boolean;
  }): Promise<boolean> {
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
    // Le sens de la décision seulement, jamais le commentaire du prof.
    this.#analytics.capture('assistant_proposal_decided', {
      accepted: decision.accepted,
      auto: decision.auto ?? false,
    });
    if (this.#beforeTurn) {
      await this.#runBeforeTurn(this.#beforeTurn);
    }
    this.#separateResumedText();
    const status = await this.#streamTurn(
      this.#api.decisionUrl(courseId, conversationId, pending.id),
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
   * Réponse du professeur aux questions en attente — ou refus de répondre
   * (la croix) : REPREND le run figé côté back, dont la réponse est le **flux
   * SSE de la suite du tour** (`tool_result`… `done`, ou un nouvel
   * `interrupt`). Les questions sont consommées dès l'ouverture du flux ; sur
   * échec d'envoi elles restent en place (réessayables), sauf 404 — plus rien
   * n'attend côté back (délai dépassé, redémarrage) : elles sont abandonnées,
   * `questionsExpired` passe à vrai et le composer revient. Retourne `false`
   * si le flux n'a pas pu s'ouvrir.
   *
   * Le hook `beforeTurn` est awaité AVANT le POST (la reprise recharge la
   * cible d'édition EN BASE).
   */
  async answerQuestions(reply: QuestionsReply): Promise<boolean> {
    const courseId = this.#courseId;
    const conversationId = this.#active()?.id;
    const pending = this.#pendingQuestions();
    if (!courseId || !conversationId || !pending || !this.#isBrowser) {
      return false;
    }
    if (this.#streamState() === 'streaming') {
      return false;
    }
    this.#streamState.set('streaming');
    this.#streamErrorStatus.set(null);
    this.#questionsExpired.set(false);
    // Des compteurs seulement, jamais le texte des questions ni des réponses.
    this.#analytics.capture('assistant_questions_answered', {
      questions: pending.questions.length,
      declined: reply.declined,
      other: reply.declined ? 0 : reply.answers.filter((answer) => answer.other !== null).length,
      reoffered: pending.reoffered,
    });
    if (this.#beforeTurn) {
      await this.#runBeforeTurn(this.#beforeTurn);
    }
    this.#separateResumedText();
    const status = await this.#streamTurn(
      this.#api.answerUrl(courseId, conversationId, pending.id),
      questionsReplyBody(reply),
      () => this.#pendingQuestions.set(null),
    );
    if (status === null) {
      return true;
    }
    if (status === 404) {
      this.#pendingQuestions.set(null);
      this.#expiredQuestionIds.add(pending.id);
      this.#questionsExpired.set(true);
      this.#streamState.set('idle');
    } else {
      this.#failStream(status);
    }
    return false;
  }

  /**
   * Le texte de la reprise est un nouveau segment côté back (rendu en
   * paragraphe distinct une fois la conversation rechargée) : le texte déjà
   * streamé du tour s'en sépare d'un saut de paragraphe, sinon les deux
   * phrases se colleraient dans le message replié.
   */
  #separateResumedText(): void {
    this.#streamingText.update((text) =>
      text.trim() && !text.endsWith('\n\n') ? `${text.trimEnd()}\n\n` : text,
    );
  }

  /** Questions de fin de conversation restées sans réponse : reproposées, sauf
      si cette instance les sait expirées. */
  #reofferQuestions(detail: AssistantConversationDetail): void {
    const pending = pendingQuestionsFromHistory(detail.messages);
    if (pending === null || this.#expiredQuestionIds.has(pending.id)) {
      return;
    }
    this.#pendingQuestions.set({ ...pending, reoffered: true });
    this.#streamState.set('awaiting');
  }

  /** Hook avant-tour de l'hôte, non bloquant : l'IA travaillera sur le dernier
      état persisté (le badge d'erreur d'autosave signale déjà le problème).
      Awaité SEULEMENT si un hook est posé : sans hook, le POST de
      matérialisation part dans le même tick que l'appel. */
  async #runBeforeTurn(hook: () => Promise<void>): Promise<void> {
    try {
      await hook();
    } catch {
      // Non bloquant.
    }
  }

  /**
   * Flux SSE d'un tour (envoi de message ou reprise HITL) via `postSseStream`,
   * abort partagé, repli du partiel sur coupure. Retourne le status HTTP d'une
   * réponse non-2xx (flux jamais ouvert — l'appelant décide), `null` sinon
   * (flux consommé ou abort, états déjà posés). `onOpen` est appelé dès la
   * réponse 2xx, avant lecture.
   */
  async #streamTurn(url: string, body: unknown, onOpen?: () => void): Promise<number | null> {
    const abort = new AbortController();
    this.#abort = abort;

    try {
      const outcome = await postSseStream<AssistantStreamEvent>({
        url,
        body,
        accessToken: this.auth.accessToken,
        signal: abort.signal,
        onOpen,
        onEvent: (event) => this.#handleEvent(event),
      });
      if ('status' in outcome) {
        return outcome.status;
      }
      if (!outcome.closed) {
        // Flux coupé sans done/error (proxy, réseau) : replier le partiel.
        this.#finalizeTurn(null, null);
        this.#failStream(0);
      }
      return null;
    } catch {
      this.#finalizeTurn(null, null);
      if (abort.signal.aborted) {
        // Stop volontaire : le partiel affiché devient un message local.
        this.#streamState.set('idle');
      } else {
        this.#failStream(0);
      }
      return null;
    } finally {
      if (this.#abort === abort) {
        this.#abort = null;
      }
    }
  }

  /** Traite un événement du flux ; `true` si le flux est clos (done/error/interrupt). */
  #handleEvent(event: AssistantStreamEvent): boolean {
    switch (event.type) {
      case 'token':
        if (event.agent !== undefined) {
          // Texte d'un sous-assistant : sur sa carte de délégation, jamais
          // dans le texte de l'assistant.
          const agent = event.agent;
          this.#toolActivity.update((activity) => applyAgentToken(activity, agent, event.delta));
        } else {
          this.#streamingText.update((text) => text + event.delta);
        }
        return false;
      case 'thinking':
        if (event.agent === undefined) {
          this.#streamingThinking.update((text) => text + event.delta);
        }
        return false;
      case 'tool_call':
        this.#toolActivity.update((activity) => [...activity, toolActivityFromCall(event)]);
        return false;
      case 'tool_result':
        if (this.#toolActivity().some((entry) => entry.id === event.id)) {
          this.#toolActivity.update((activity) => applyToolResult(activity, event));
          if (event.agent === undefined && DELEGATION_TOOLS.has(event.name)) {
            // Compte rendu d'un sous-assistant : le texte qui suit est un
            // nouveau segment côté back.
            this.#separateResumedText();
          }
        } else {
          // Reprise de questions reproposées à la réouverture : leur appel est
          // dans les messages persistés, ce résultat s'y apparie.
          this.#appendMessage(toolRowFromResult(event));
        }
        return false;
      case 'interrupt': {
        // Usage des rounds déjà joués par le run figé, cumulé AVANT toute
        // branche (le repli défensif ci-dessous le porte aussi).
        this.#turnUsage = addUsage(this.#turnUsage, event.usage);
        // Tool bloquant (HITL) : le run est figé côté back, le flux se ferme —
        // questions de l'assistant (`pendingQuestions`, le formulaire remplace
        // le composer) ou proposition d'édition (`pendingProposal`, la revue
        // de l'hôte s'y adosse — éditeur, ou revue globale d'une proposition
        // de sous-assistant, rattachée à sa délégation), typées depuis l'appel
        // figé de l'activité d'outils ; le tour reste affiché en l'état, il
        // reprendra via `answerQuestions` ou `resumeProposal`.
        const entry = this.#toolActivity().find((e) => e.id === event.tool_call_id);
        const questions = entry?.name === ASK_QUESTIONS ? parseQuestions(entry) : null;
        const proposal =
          entry && questions === null ? this.#withDelegation(parseProposal(entry), entry) : null;
        if (entry && questions !== null) {
          this.#pendingQuestions.set({ id: entry.id, questions, reoffered: false });
          this.#streamState.set('awaiting');
        } else if (proposal !== null) {
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
        this.#turnUsage = addUsage(this.#turnUsage, event.usage);
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
   * Proposition d'un sous-assistant (appel figé tagué `agent`) : rattachée à
   * sa délégation, parsée depuis l'appel `edit_*` parent de l'activité — sans
   * délégation lisible, la proposition reste nue (l'hôte ne saura pas la
   * revoir : ligne d'outil générique).
   */
  #withDelegation(
    proposal: AssistantPendingProposal | null,
    entry: AssistantToolActivity,
  ): AssistantPendingProposal | null {
    if (proposal === null || entry.agent === undefined) {
      return proposal;
    }
    const parent = this.#toolActivity().find((e) => e.id === entry.agent);
    const delegation = parent ? parseDelegation(parent) : null;
    return delegation === null ? proposal : { ...proposal, delegation };
  }

  /**
   * Replie le tour streamé en messages locaux (`foldTurnMessages`, avec
   * l'usage cumulé du tour) et patche titre/`updated_at` de la conversation
   * dans la liste, sans refetch.
   */
  #finalizeTurn(sources: AssistantSources | null, title: string | null): void {
    const folded = foldTurnMessages(
      this.#toolActivity(),
      this.#streamingText(),
      sources,
      this.#turnUsage,
    );
    this.#turnUsage = null;
    for (const message of folded) {
      this.#appendMessage(message);
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
    this.#turnUsage = null;
    this.#streamState.set('idle');
    this.#streamErrorStatus.set(null);
    // Nouvelle vue/nouveau tour : une proposition ou des questions encore en
    // attente sont abandonnées localement (le back purge la reprise au
    // prochain message, ou à son TTL — des questions sont reproposées si la
    // conversation est rouverte avant).
    this.#pendingProposal.set(null);
    this.#pendingQuestions.set(null);
    this.#questionsExpired.set(false);
  }

  #appendMessage(partial: LocalMessage): void {
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
        cached_input_tokens: null,
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
