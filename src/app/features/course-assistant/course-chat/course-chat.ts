import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
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
import {
  AssistantDelegation,
  parseDelegation,
} from '../../../core/course-assistant/delegation';
import { parseQuestions, QuestionAnswer } from '../../../core/course-assistant/questions';
import { progressiveReveal } from '../../../core/course-assistant/stream-reveal';
import { formatTokenCount, turnUsageByMessage } from '../../../core/course-assistant/usage';
import { LanguageService } from '../../../core/i18n/language.service';
import { BlockCitations } from '../../../shared/block-citations/block-citations.directive';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';
import { Spinner } from '../../../shared/spinner/spinner';
import { CourseChatConversations } from './course-chat-conversations';
import { CourseChatDelegation, DelegationChildView } from './course-chat-delegation';
import { CourseChatProposal } from './course-chat-proposal';
import { CourseChatQuestions } from './course-chat-questions';
import { CourseChatQuestionsCard, QuestionsCardStatus } from './course-chat-questions-card';
import { CourseChatSettings } from './course-chat-settings';
import {
  ChatToolView,
  CourseChatTool,
  isProposalView,
  isQuestionsView,
  toolRowsById,
  toolViewsFor,
} from './course-chat-tool';

export { STREAM_REVEAL_TICK_MS } from '../../../core/course-assistant/stream-reveal';

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
 *   `app-course-chat-tool`), citations `oc-block:` cliquables
 *   (`ocBlockCitations`) ;
 * - **mode edit** (`blockId` OU `moduleId` passé, sans `placeholder` — hôte :
 *   la colonne ancrée de block-editor sur un bloc TEXTE ou EXERCICE, ou celle
 *   de module-editor) : même chat, câblé sur l'instance d'`AssistantChatState`
 *   fournie par l'hôte (contexte `block_text`, `block_exercise` ou `module`,
 *   conversations propres à la cible) ; les appels des tools de proposition du
 *   modèle (`PROPOSAL_TOOLS`) deviennent des cartes de proposition
 *   INFORMATIVES dans le fil (`app-course-chat-proposal` : résumé + décision
 *   rendue, ou invite tant que le flux attend) — la revue (diff/carte +
 *   décision) vit dans l'ÉDITEUR de l'hôte, qui lit la même instance d'état ;
 * - **mode placeholder** (`placeholder` vrai) : coquille « bientôt », garde
 *   générique d'un hôte dont le contexte d'édition n'existerait pas côté back
 *   (aucun hôte ne la pose).
 *
 * Dans les deux modes actifs, les **questions de l'assistant** (tool
 * `ask_questions`, run figé) remplacent le composer par leur formulaire
 * (`app-course-chat-questions`, une question par étape, refus par la croix) ;
 * leur appel devient une carte dans le fil (`app-course-chat-questions-card`).
 *
 * Édition globale (mode global, `GlobalEditService`) : un appel `edit_*` de
 * l'assistant devient une carte de délégation (`app-course-chat-delegation`)
 * qui imbrique, en direct, l'activité de son sous-assistant (événements
 * tagués `agent`) — ses propositions y sont des cartes « revues dans la
 * fenêtre globale » (`CourseAssistantService.proposals`), jamais dans le
 * fil de premier niveau.
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
    BlockCitations,
    TranslocoPipe,
    MarkdownView,
    RouterLink,
    CourseChatConversations,
    CourseChatDelegation,
    CourseChatProposal,
    CourseChatQuestions,
    CourseChatQuestionsCard,
    CourseChatTool,
    CourseChatSettings,
    Spinner,
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
   * hôte dont le contexte d'édition n'existerait pas côté back — sans elle, la
   * cible basculerait en chat d'édition et la création de conversation
   * échouerait (422). Aucun hôte ne la pose ; le mode reste testé.
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

  /** Texte streamé dévoilé progressivement pour le rendu (le brut vit au service). */
  protected readonly streamingRender = progressiveReveal(
    () => this.assistant.streamingText(),
    () => this.mode() !== 'placeholder',
  );

  /**
   * Libellé de l'indicateur d'activité épinglé au-dessus du composer : « rédige »
   * dès qu'un texte est dévoilé, « travaille » tant que le tour n'a produit que
   * du raisonnement ou des appels d'outils.
   */
  protected readonly activityKey = computed(() =>
    this.streamingRender() ? 'courseChat.generating' : 'courseChat.working',
  );

  /** Tours `tool` de la conversation, indexés par id d'appel (résultats persistés). */
  readonly #toolRowsById = computed(() =>
    toolRowsById(this.assistant.active()?.messages ?? []),
  );

  /**
   * Tokens par tour, indexés par le dernier message assistant du tour
   * (`turnUsageByMessage`) : la ligne s'affiche sous ce message — un tour
   * HITL rechargé (plusieurs segments) et un tour live replié (un seul)
   * donnent la même somme.
   */
  protected readonly turnUsage = computed(() =>
    turnUsageByMessage(this.assistant.active()?.messages ?? []),
  );

  /**
   * Activité d'outils du tour en cours, dans la forme rendue par
   * `app-course-chat-tool` — celle de l'assistant lui-même ; l'activité d'un
   * sous-assistant (`agent`) est rendue DANS sa carte de délégation.
   */
  protected readonly liveToolViews = computed<ChatToolView[]>(() =>
    this.assistant
      .toolActivity()
      .filter((entry) => entry.agent === undefined)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        args: entry.args,
        status: entry.status,
        result: entry.result,
      })),
  );

  /** Activité des sous-assistants du tour en cours, par appel de délégation. */
  readonly #liveChildren = computed(() => {
    const children = new Map<string, DelegationChildView[]>();
    for (const entry of this.assistant.toolActivity()) {
      if (entry.agent === undefined) {
        continue;
      }
      const view: ChatToolView = {
        id: entry.id,
        name: entry.name,
        args: entry.args,
        status: entry.status,
        result: entry.result,
      };
      const list = children.get(entry.agent) ?? [];
      list.push(this.#childView(view));
      children.set(entry.agent, list);
    }
    return children;
  });

  /** Texte streamé par chaque sous-assistant du tour en cours. */
  readonly #liveAgentText = computed(() => {
    const texts = new Map<string, string>();
    for (const entry of this.assistant.toolActivity()) {
      if (entry.agentText) {
        texts.set(entry.id, entry.agentText);
      }
    }
    return texts;
  });

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

    // Auto-scroll : suit le flux tant que l'utilisateur est resté en bas.
    effect(() => {
      if (this.mode() === 'placeholder') {
        return;
      }
      this.assistant.active()?.messages.length;
      this.streamingRender();
      this.assistant.toolActivity();
      this.assistant.pendingQuestions();
      if (this.#isBrowser && this.#pinnedToBottom) {
        setTimeout(() => this.#scrollToBottom(), 0);
      }
    });
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

  /** Citation `oc-block:` cliquée dans le fil (directive `ocBlockCitations`) :
      navigation vers l'éditeur du bloc cité. */
  protected goToBlock(blockId: string): void {
    void this.#router.navigate([
      '/',
      this.language.lang(),
      'courses',
      this.courseId(),
      'blocks',
      blockId,
    ]);
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

  /** Suppression confirmée dans l'historique (deux temps : `CourseChatConversations`). */
  protected deleteConversation(id: string): void {
    void this.assistant.deleteConversation(id);
  }

  /** Appels d'outils d'un message assistant, appariés à leurs tours `tool`. */
  protected toolViews(message: AssistantMessage): ChatToolView[] {
    return toolViewsFor(message, this.#toolRowsById());
  }

  /** Compteur de tokens dans la locale de l'UI (pas de DecimalPipe : locale fr non enregistrée). */
  protected formatTokens(value: number): string {
    return formatTokenCount(value, this.language.lang());
  }

  // ------------------------------------------- propositions (tous modes actifs)

  /** Appel d'un tool de proposition rendu en carte (`isProposalView`). */
  protected isProposal(view: ChatToolView): boolean {
    return isProposalView(view);
  }

  protected proposalSummary(view: ChatToolView): string | null {
    const summary = view.args['summary'];
    return typeof summary === 'string' && summary ? summary : null;
  }

  // ------------------------------------------- délégations (édition globale)

  /** Appel `edit_*` rendu en carte de délégation : args réécrits lisibles. */
  protected isDelegation(view: ChatToolView): boolean {
    return parseDelegation(view) !== null;
  }

  protected delegationOf(view: ChatToolView): AssistantDelegation | null {
    return parseDelegation(view);
  }

  /** Activité du sous-assistant d'une délégation en cours (vide hors direct). */
  protected childrenOf(id: string): DelegationChildView[] {
    return this.#liveChildren().get(id) ?? [];
  }

  protected agentTextOf(id: string): string {
    return this.#liveAgentText().get(id) ?? '';
  }

  /** Rouvre la fenêtre de revue globale (proposition de sous-assistant en attente). */
  protected showReview(): void {
    const assistant = this.assistant;
    if (assistant instanceof CourseAssistantService) {
      assistant.showReview();
    }
  }

  #childView(view: ChatToolView): DelegationChildView {
    if (this.isQuestions(view)) {
      return {
        kind: 'questions',
        tool: view,
        count: this.questionCount(view),
        status: this.questionsStatus(view),
        result: this.questionsResult(view),
      };
    }
    if (this.isProposal(view)) {
      return { kind: 'proposal', tool: view, summary: this.proposalSummary(view) };
    }
    return { kind: 'tool', tool: view };
  }

  // ------------------------------------------------- questions (tous modes)

  /** Appel `ask_questions` rendu en carte (`isQuestionsView`). */
  protected isQuestions(view: ChatToolView): boolean {
    return isQuestionsView(view);
  }

  protected questionCount(view: ChatToolView): number {
    return parseQuestions(view)?.length ?? 0;
  }

  /**
   * Résultat d'une série : le tour `tool` persisté en entier s'il existe
   * (conversation rechargée), sinon l'extrait streamé.
   */
  protected questionsResult(view: ChatToolView): string | null {
    return this.#toolRowsById().get(view.id)?.content || view.result;
  }

  /**
   * En attente tant que l'appel tourne ou que le formulaire la porte ; sans
   * résultat hors flux, la série est restée sans réponse (pendant une reprise,
   * le résultat arrive en tête du flux).
   */
  protected questionsStatus(view: ChatToolView): QuestionsCardStatus {
    if (view.status === 'running' || this.assistant.pendingQuestions()?.id === view.id) {
      return 'pending';
    }
    if (this.questionsResult(view) !== null || this.assistant.streamState() === 'streaming') {
      return 'done';
    }
    return 'unanswered';
  }

  protected answerQuestions(answers: QuestionAnswer[]): void {
    this.#pinnedToBottom = true;
    void this.assistant.answerQuestions({ declined: false, answers });
  }

  protected declineQuestions(): void {
    this.#pinnedToBottom = true;
    void this.assistant.answerQuestions({ declined: true });
  }
}
