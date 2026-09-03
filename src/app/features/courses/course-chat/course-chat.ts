import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { AssistantMessage } from '../../../core/course-assistant/assistant.model';
import { CourseAssistantService } from '../../../core/course-assistant/course-assistant.service';
import { parseProposal, PROPOSAL_TOOLS } from '../../../core/course-assistant/proposals';
import { LanguageService } from '../../../core/i18n/language.service';
import { isBlockId } from '../../../core/markdown/course-block-ref';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';
import { CourseChatProposal } from './course-chat-proposal';
import { CourseChatSettings } from './course-chat-settings';
import { ChatToolView, CourseChatTool, toolResultExcerpt } from './course-chat-tool';

/**
 * Dévoilement progressif du texte streamé : un tick toutes les 40 ms
 * (≈ 25 rendus markdown/s — fluide à l'œil, sans saturer le thread principal)
 * qui rattrape une PART du retard accumulé (avec un plancher et un plafond de
 * caractères par tick). Les rafales du réseau ou du provider sont ainsi
 * lissées en un défilement régulier, au lieu des sauts de l'ancien rendu
 * débouncé à 400 ms.
 */
export const STREAM_REVEAL_TICK_MS = 40;
const STREAM_REVEAL_CATCH_UP = 0.3;
const STREAM_REVEAL_MIN_CHARS = 3;
const STREAM_REVEAL_MAX_CHARS = 160;

/** Distance au bas (px) sous laquelle l'auto-scroll reste accroché. */
const SCROLL_PIN_THRESHOLD_PX = 80;

/**
 * Panneau assistant IA du cours. Trois régimes, choisis par les inputs :
 *
 * - **mode global** (aucun contexte d'édition — hôte : le panneau flottant
 *   `assistant-panel`, présent sur la page cours ET sur les pages d'édition) :
 *   chat câblé sur `CourseAssistantService` (l'instance root
 *   d'`AssistantChatState`) — vue d'entrée = conversation vide (brouillon
 *   local, créée côté serveur au premier message), historique des
 *   conversations derrière la flèche retour, fil streamé (texte dévoilé
 *   progressivement, thinking repliable, appels d'outils dépliables —
 *   `app-course-chat-tool`), citations `oc-block:` cliquables par délégation
 *   d'événements sur le fil ;
 * - **mode edit** (`blockId` OU `moduleId` passé, sans `placeholder` — hôte :
 *   la colonne ancrée de block-editor sur un bloc TEXTE ou EXERCICE, ou celle
 *   de module-editor) : même chat, câblé sur l'instance d'`AssistantChatState`
 *   fournie par l'hôte (contexte `block_text`, `block_exercise` ou `module`,
 *   conversations propres à la cible) ; les appels des tools de proposition du
 *   modèle (`PROPOSAL_TOOLS`) deviennent des cartes de proposition
 *   INFORMATIVES dans le fil (`app-course-chat-proposal` : résumé + décision
 *   rendue, ou invite tant que le flux attend) — la revue (diff/carte +
 *   décision) vit dans l'ÉDITEUR de l'hôte (`app-proposal-review`,
 *   `app-exercise-proposal-review`, `app-module-proposal-review`), qui lit la
 *   même instance d'état ;
 * - **mode placeholder** (`placeholder` vrai) : la coquille « bientôt »
 *   historique, garde générique d'un hôte dont le contexte n'est pas livré —
 *   plus aucun hôte ne la pose.
 *
 * Deux régimes de rendu du texte assistant : pendant le stream,
 * `app-markdown-view` sans `courseId` (références oc-* inertes → re-rendus
 * bon marché) sur le signal dévoilé progressivement (`streamingRender`) ; un
 * message finalisé est rendu une fois avec le `courseId` réel (les
 * `oc-resource:` se résolvent).
 */
@Component({
  selector: 'app-course-chat',
  imports: [
    TranslocoPipe,
    MarkdownView,
    RouterLink,
    CourseChatProposal,
    CourseChatTool,
    CourseChatSettings,
  ],
  templateUrl: './course-chat.html',
  styleUrl: './course-chat.scss',
})
export class CourseChat {
  /** Contexte — `courseId` toujours connu ; `blockId`/`moduleId` selon l'hôte. */
  readonly courseId = input.required<string>();
  readonly blockId = input<string | null>(null);
  readonly moduleId = input<string | null>(null);
  /**
   * Force la coquille « bientôt » malgré une cible : garde générique pour un
   * hôte dont le contexte d'édition n'est PAS livré — sans elle, la cible
   * basculerait en chat d'édition et la création de conversation échouerait
   * (422 côté back). Plus aucun hôte ne la pose aujourd'hui : les quatre
   * contextes (texte, exercice, module) sont livrés.
   */
  readonly placeholder = input(false);

  /** Demande de repli du panneau ; l'hôte pilote l'affichage. */
  readonly collapse = output<void>();

  readonly #injector = inject(Injector);
  protected readonly language = inject(LanguageService);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Régime du panneau (doc de classe) : `placeholder` prime, puis une cible
   * d'édition (`blockId` ou `moduleId`) choisit `edit`, défaut `global`.
   */
  protected readonly mode = computed<'global' | 'edit' | 'placeholder'>(() => {
    if (this.placeholder()) {
      return 'placeholder';
    }
    return this.blockId() !== null || this.moduleId() !== null ? 'edit' : 'global';
  });

  /**
   * Injection PARESSEUSE : le service (et sa chaîne AuthService → OAuthService)
   * n'est résolu que hors placeholder — un hôte en placeholder (et sa spec)
   * n'a **aucune** dépendance IA à fournir. Mode global → l'instance root
   * (`CourseAssistantService`) ; mode edit → l'instance d'`AssistantChatState`
   * fournie par l'hôte (`providers` de `BlockEditor`/`ModuleEditor`), résolue
   * par la chaîne d'injecteurs d'éléments. Toute spec montant un mode actif
   * fournit les mocks à signaux de `testing/assistant.fixture.ts`.
   */
  #assistantRef: AssistantChatState | null = null;
  protected get assistant(): AssistantChatState {
    return (this.#assistantRef ??=
      this.mode() === 'edit'
        ? this.#injector.get(AssistantChatState)
        : this.#injector.get(CourseAssistantService));
  }

  /** Conversation active = brouillon local (id vide, rien en base). */
  protected readonly activeIsDraft = computed(() => this.assistant.active()?.id === '');

  /**
   * Tour en cours : flux ouvert (`streaming`) OU proposition en attente de
   * décision (`awaiting` — flux HITL fermé, le run est figé côté back) : le
   * fil garde l'affichage live et le composer attend.
   */
  protected readonly turnActive = computed(() => {
    const state = this.assistant.streamState();
    return state === 'streaming' || state === 'awaiting';
  });

  protected readonly draft = signal('');
  protected readonly deleteArmed = signal<string | null>(null);

  /** Texte streamé dévoilé progressivement pour le rendu (le brut vit au service). */
  protected readonly streamingRender = signal('');
  #revealTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tours `tool` de la conversation, indexés par id d'appel (résultats persistés). */
  readonly #toolRowsById = computed(() => {
    const rows = new Map<string, AssistantMessage>();
    for (const message of this.assistant.active()?.messages ?? []) {
      if (message.role === 'tool' && message.tool_call_id) {
        rows.set(message.tool_call_id, message);
      }
    }
    return rows;
  });

  /** Activité d'outils du tour en cours, dans la forme rendue par `app-course-chat-tool`. */
  protected readonly liveToolViews = computed<ChatToolView[]>(() =>
    this.assistant.toolActivity().map((entry) => ({
      id: entry.id,
      name: entry.name,
      args: entry.args,
      status: entry.status,
      result: entry.result,
    })),
  );

  protected readonly log = viewChild<ElementRef<HTMLElement>>('log');
  #pinnedToBottom = true;

  /** Clé i18n de l'erreur de flux courante (`null` hors erreur). */
  protected readonly errorKey = computed(() => {
    if (this.assistant.streamState() !== 'error') {
      return null;
    }
    switch (this.assistant.streamErrorStatus()) {
      case 429:
        return 'courseChat.errors.quota';
      case 400:
        return 'courseChat.errors.key';
      case 422:
        return 'courseChat.errors.config';
      case 503:
        return 'courseChat.errors.unavailable';
      default:
        return 'courseChat.errors.generic';
    }
  });

  /** Le lien vers les réglages IA n'aide que pour quota/clé/config. */
  protected readonly errorLinksToSettings = computed(() => {
    const status = this.assistant.streamErrorStatus();
    return status === 429 || status === 400 || status === 422;
  });

  constructor() {
    effect(() => {
      const courseId = this.courseId();
      if (this.mode() !== 'placeholder' && this.#isBrowser) {
        void this.assistant.loadConversations(courseId);
      }
    });

    // Dévoilement progressif du texte streamé (constantes STREAM_REVEAL_*) :
    // chaque delta reçu (re)lance le tick, qui se replanifie tant qu'il reste
    // du retard à rattraper ; texte vide = tour terminé, rendu remis à zéro.
    effect(() => {
      if (this.mode() === 'placeholder') {
        return;
      }
      if (!this.assistant.streamingText()) {
        this.#cancelReveal();
        this.streamingRender.set('');
        return;
      }
      this.#scheduleReveal();
    });
    inject(DestroyRef).onDestroy(() => this.#cancelReveal());

    // Auto-scroll : suit le flux tant que l'utilisateur est resté en bas.
    effect(() => {
      if (this.mode() === 'placeholder') {
        return;
      }
      this.assistant.active()?.messages.length;
      this.streamingRender();
      this.assistant.toolActivity();
      if (this.#isBrowser && this.#pinnedToBottom) {
        setTimeout(() => this.#scrollToBottom(), 0);
      }
    });
  }

  #scheduleReveal(): void {
    if (this.#revealTimer !== null) {
      return;
    }
    this.#revealTimer = setTimeout(() => {
      this.#revealTimer = null;
      this.#revealStep();
    }, STREAM_REVEAL_TICK_MS);
  }

  #cancelReveal(): void {
    if (this.#revealTimer !== null) {
      clearTimeout(this.#revealTimer);
      this.#revealTimer = null;
    }
  }

  /** Un tick : avance vers le texte reçu, se replanifie s'il reste du retard. */
  #revealStep(): void {
    const target = this.assistant.streamingText();
    const shown = this.streamingRender();
    const base = target.startsWith(shown) ? shown.length : 0;
    const backlog = target.length - base;
    if (backlog <= 0) {
      return;
    }
    const step = Math.min(
      backlog,
      Math.max(
        STREAM_REVEAL_MIN_CHARS,
        Math.min(STREAM_REVEAL_MAX_CHARS, Math.ceil(backlog * STREAM_REVEAL_CATCH_UP)),
      ),
    );
    this.streamingRender.set(target.slice(0, base + step));
    if (base + step < target.length) {
      this.#scheduleReveal();
    }
  }

  #scrollToBottom(): void {
    const element = this.log()?.nativeElement;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }

  protected onLogScroll(): void {
    const element = this.log()?.nativeElement;
    if (element) {
      const fromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      this.#pinnedToBottom = fromBottom < SCROLL_PIN_THRESHOLD_PX;
    }
  }

  /**
   * Délégation des citations `oc-block:` — clic ou Entrée sur l'ancre
   * `[data-oc-block-id]` (re-garde `isBlockId` : l'attribut peut venir de
   * HTML brut) → navigation vers l'éditeur du bloc cité.
   */
  protected onCitation(event: Event): void {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest<HTMLElement>('[data-oc-block-id]');
    const blockId = anchor?.getAttribute('data-oc-block-id');
    if (!blockId || !isBlockId(blockId)) {
      return;
    }
    event.preventDefault();
    void this.#router.navigate([
      '/',
      this.language.lang(),
      'courses',
      this.courseId(),
      'blocks',
      blockId,
    ]);
  }

  protected onCitationKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onCitation(event);
    }
  }

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected send(): void {
    const content = this.draft().trim();
    if (!content || this.turnActive()) {
      return;
    }
    this.draft.set('');
    this.#pinnedToBottom = true;
    void this.assistant.sendMessage(content);
  }

  protected stop(): void {
    this.assistant.stopStreaming();
  }

  protected newConversation(): void {
    this.#pinnedToBottom = true;
    this.assistant.startNewConversation();
  }

  protected openConversation(id: string): void {
    this.#pinnedToBottom = true;
    void this.assistant.openConversation(id);
  }

  protected backToList(): void {
    this.assistant.closeConversation();
  }

  /** Suppression en deux temps, désarmée au blur (motif course-resources). */
  protected requestDelete(id: string): void {
    if (this.deleteArmed() === id) {
      this.deleteArmed.set(null);
      void this.assistant.deleteConversation(id);
    } else {
      this.deleteArmed.set(id);
    }
  }

  protected disarmDelete(): void {
    this.deleteArmed.set(null);
  }

  /**
   * Appels d'outils d'un message assistant, appariés à leurs tours `tool`
   * (`is_error` et extrait du contenu). Sans tour apparié (round interrompu
   * avant le résultat) : « résultat indisponible ».
   */
  protected toolViews(message: AssistantMessage): ChatToolView[] {
    const rows = this.#toolRowsById();
    return message.tool_calls.map((call) => {
      const row = rows.get(call.id);
      return {
        id: call.id,
        name: call.name,
        args: call.arguments ?? {},
        status: row?.is_error ? 'error' : 'done',
        result: row?.content ? toolResultExcerpt(row.content) : null,
      };
    });
  }

  /** Date dans la locale de l'UI (pas de DatePipe : locale fr non enregistrée). */
  protected updatedOn(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.lang());
  }

  // -------------------------------------------------- propositions (mode edit)

  /**
   * Vrai pour un appel d'un tool de proposition rendu en carte : mode edit
   * uniquement, args bien formés (`parseProposal` — malformés → ligne d'outil
   * générique) et appel non échoué (l'échec — plafond dépassé, référence
   * inconnue… — s'explique mieux en ligne d'outil, son message d'erreur
   * visible).
   */
  protected isProposal(view: ChatToolView): boolean {
    return (
      this.mode() === 'edit' &&
      PROPOSAL_TOOLS.has(view.name) &&
      view.status !== 'error' &&
      parseProposal(view) !== null
    );
  }

  protected proposalSummary(view: ChatToolView): string | null {
    const summary = view.args['summary'];
    return typeof summary === 'string' && summary ? summary : null;
  }
}
