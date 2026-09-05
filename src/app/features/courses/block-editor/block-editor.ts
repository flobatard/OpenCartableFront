import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { merge, Subject } from 'rxjs';
import {
  buildBlockMetaForm,
  patchBlockMetaForm,
  payloadFromBlockMetaForm,
} from '../../../core/courses/block-meta-form';
import {
  BlockMetaPayload,
  CourseBlock,
  DocumentContentPayload,
  ExerciseContentPayload,
} from '../../../core/courses/course.model';
import {
  payloadFromDocumentContent,
  payloadFromDocumentForm,
} from '../../../core/courses/document-form';
import {
  applyGeneratedIds,
  payloadFromBlockContent,
  payloadFromExerciseForm,
} from '../../../core/courses/exercise-form';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { CourseService } from '../../../core/courses/course.service';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { ExerciseSubmissionsService } from '../../../core/courses/exercise-submissions.service';
import { createAutosave } from '../../../core/editing/autosave';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleService } from '../../../core/modules/module.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { MarkdownField } from '../../../shared/markdown-field/markdown-field';
import { ResizeHandle } from '../../../shared/resize-handle/resize-handle.directive';
import { CourseChat } from '../course-chat/course-chat';
import { DocumentEditor } from '../document-editor/document-editor';
import { ExerciseEditor } from '../exercise-editor/exercise-editor';
import { ModuleBlockEditor } from '../module-block-editor/module-block-editor';
import { ExerciseProposal, ExerciseProposalReview } from './exercise-proposal-review';
import { buildBlockProposalHost } from './proposal-host';
import { ProposalReview } from './proposal-review';

type MetaSaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Coquille-page d'édition d'un bloc : en-tête et navigation entre blocs,
 * formulaire titre/description (tous types, enregistrement explicite), et un
 * espace de travail redimensionnable éditeur | chat d'édition pour les blocs
 * texte et exercice. Le contenu est délégué par type — `app-markdown-field`
 * (texte), `app-exercise-editor` (exercice), `app-document-editor` (document :
 * légende/affichage autosauvés, ressource pointée en PATCH immédiat),
 * `app-module-block-editor` (module pointé, PATCH immédiat) — et l'autosave
 * (`createAutosave`) reste ici, dans un pipeline unique dont le payload est
 * relu à l'envoi. Pour un exercice, les ids de questions générés par le back
 * sont réécrits après chaque save sur un snapshot des groupes capturé à
 * l'envoi : sans ça l'autosave suivant renverrait `id: null` et casserait la
 * stabilité des ids.
 *
 * Chat d'édition HITL (contextes `block_text` / `block_exercise`) : la page
 * fournit sa propre instance d'`AssistantChatState`, configurée selon le type
 * du bloc à l'init-once, et branche le hook avant-tour sur un flush immédiat
 * de l'autosave (le back lit le bloc EN BASE). Une proposition en attente
 * remplace l'éditeur par sa revue (`ProposalHost`, éditeur masqué par classe :
 * Monaco survit) ; à l'acceptation, l'application passe par l'éditeur (texte :
 * édit Monaco annulable ; exercice : API `apply*` de l'éditeur d'exercice),
 * puis la décision reprend le flux.
 */
@Component({
  selector: 'app-block-editor',
  imports: [
    ResizeHandle,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MarkdownField,
    CourseChat,
    DocumentEditor,
    ExerciseEditor,
    ModuleBlockEditor,
    ProposalReview,
    ExerciseProposalReview,
  ],
  providers: [AssistantChatState],
  templateUrl: './block-editor.html',
  styleUrl: './block-editor.scss',
})
export class BlockEditor implements OnInit, OnDestroy {
  readonly #courses = inject(CourseService);
  readonly #courseStyle = inject(CourseStyleService);
  readonly #submissions = inject(ExerciseSubmissionsService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  /** Tentatives des élèves sur l'exercice édité (résumé prof, boutons d'effacement). */
  protected readonly submissionSummary = this.#submissions.summary;
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #route = inject(ActivatedRoute);
  /** Params lus en snapshot (pas de withComponentInputBinding dans ce projet). */
  protected readonly courseId = this.#route.snapshot.paramMap.get('id') ?? '';
  /** Public au template pour alimenter le contexte du panneau chat (`[blockId]`). */
  protected readonly blockId = this.#route.snapshot.paramMap.get('blockId') ?? '';

  protected readonly language = inject(LanguageService);

  protected readonly detail = this.#courses.detail;
  protected readonly loading = this.#courses.detailLoading;
  protected readonly loadError = this.#courses.detailError;

  /** Bloc édité, résolu dans le détail chargé (`null` = introuvable). */
  protected readonly block = computed(
    () => this.detail()?.blocks.find((b) => b.id === this.blockId) ?? null,
  );

  /** Blocs du cours dans l'ordre du back (navigation précédent/suivant). */
  protected readonly blocks = computed<CourseBlock[]>(() => this.detail()?.blocks ?? []);

  /** Rang 1-indexé du bloc édité (0 si introuvable). */
  protected readonly blockIndex = computed(() => {
    const block = this.block();
    return block === null ? 0 : this.blocks().indexOf(block) + 1;
  });

  protected readonly previousBlock = computed<CourseBlock | null>(() => this.#neighbour(-1));
  protected readonly nextBlock = computed<CourseBlock | null>(() => this.#neighbour(1));

  /**
   * Contenu markdown édité (blocs texte), relayé au `app-markdown-field`.
   * Public — exception à la convention `protected` : jsdom ne peut pas taper
   * dans monaco, les specs pilotent ce contrôle.
   */
  readonly content = new FormControl('', { nonNullable: true });

  /**
   * Miroir signal du contenu markdown (blocs texte) — « original » du diff
   * des propositions du chat. Posé directement à l'init (le `setValue` initial
   * n'émet pas) puis tenu en phase par `valueChanges` ; jamais
   * `toSignal(valueChanges)`.
   */
  protected readonly contentMarkdown = signal('');

  /** Instance d'état du chat ancré (contexte d'édition du bloc), propre à la page. */
  readonly #assistantState = inject(AssistantChatState);

  /**
   * Orchestration des revues HITL (proposition en attente → revue → décision
   * → application → reprise) : `proposals.pending()` masque l'éditeur tant
   * qu'une proposition attend, `proposals.review()` choisit la revue (texte ou
   * exercice, « original » figé à l'interrupt). Les callbacks lisent les
   * éditeurs montés à l'appel (viewChild), jamais à la construction.
   */
  protected readonly proposals = buildBlockProposalHost({
    state: this.#assistantState,
    currentMarkdown: () => this.contentMarkdown(),
    currentExercise: () => {
      const editor = this.exerciseEditor();
      return editor ? payloadFromExerciseForm(editor.form) : null;
    },
    applyText: (markdown: string) => this.#applyText(markdown),
    applyExercise: (proposal: ExerciseProposal) => this.#applyExercise(proposal),
  });

  /** Clé i18n de l'erreur de revue courante (`null` = aucune). */
  protected readonly proposalErrorKey = computed(() => {
    switch (this.proposals.error()) {
      case 'decision':
        return 'courseChat.proposal.decisionError';
      case 'target':
        return 'courseChat.proposal.exercise.targetMissing';
      default:
        return null;
    }
  });

  /** Champ markdown monté (blocs texte) — l'application d'une proposition HITL
      passe par son `replaceAll` (édit Monaco annulable par Ctrl-Z). */
  protected readonly markdownField = viewChild(MarkdownField);

  /** Éditeur d'exercice monté (blocs exercice) — son `form` public est piloté
      ici pour le write-back des ids et le flush à la destruction. */
  protected readonly exerciseEditor = viewChild(ExerciseEditor);

  /** Éditeur de document monté (blocs document) — `form` lu à l'envoi du PATCH,
      `resetResource` appelé sur échec du PATCH de ressource. */
  protected readonly documentEditor = viewChild(DocumentEditor);

  /** Picker de module monté (blocs module) — `resetModule` sur échec du PATCH. */
  protected readonly moduleBlockEditor = viewChild(ModuleBlockEditor);

  /** Frappes de l'éditeur d'exercice, fusionnées dans le pipeline d'autosave. */
  readonly #exerciseDrafts = new Subject<ExerciseContentPayload>();

  /** Frappes de l'éditeur de document (légende/affichage), même pipeline. */
  readonly #documentDrafts = new Subject<DocumentContentPayload>();

  /** Autosave du contenu (texte, exercice, document) : un pipeline pour les trois. */
  readonly #autosave = createAutosave<Record<string, unknown>>({
    triggers: merge(this.content.valueChanges, this.#exerciseDrafts, this.#documentDrafts),
    current: () => this.#currentPayload(),
    save: (payload) => this.#persist(payload),
  });
  protected readonly saveState = this.#autosave.state;

  readonly #resources = inject(ResourceService);
  /** Ressources `available` du cours, proposées au picker du bloc document. */
  protected readonly availableResources = computed(() =>
    this.#resources.list().filter((r) => r.status === 'available'),
  );
  /** Échec du PATCH de ressource (canal distinct de l'autosave du contenu). */
  protected readonly resourceSaveError = signal(false);
  #resourcesRequested = false;

  readonly #modules = inject(ModuleService);
  /** Modules du cours, proposés au picker du bloc module. */
  protected readonly availableModules = this.#modules.list;
  /** Échec du PATCH de module (canal distinct — pas d'autosave sur ce type). */
  protected readonly moduleSaveError = signal(false);
  #modulesRequested = false;

  /**
   * Titre/description du bloc (tous types) — enregistrement explicite (bouton),
   * indépendant de l'autosave du contenu. `#savedPayload` est la référence de
   * complétude « modifié » (snapshot JSON, motif page profil).
   */
  protected readonly metaForm = buildBlockMetaForm();
  readonly #metaValue = toSignal(this.metaForm.valueChanges, {
    initialValue: this.metaForm.getRawValue(),
  });
  readonly #savedPayload = signal<BlockMetaPayload>({ title: null, description: null });
  protected readonly metaSaveState = signal<MetaSaveState>('idle');

  /** Actif quand le formulaire méta diffère du dernier enregistré (et pas en vol). */
  protected readonly canSaveMeta = computed(() => {
    this.#metaValue();
    if (this.metaSaveState() === 'saving') {
      return false;
    }
    return (
      JSON.stringify(payloadFromBlockMetaForm(this.metaForm)) !==
      JSON.stringify(this.#savedPayload())
    );
  });

  #metaInitialized = false;

  /** Partage de largeur éditeur/chat piloté par la poignée (drag), en % de la
      colonne éditeur ; `dragging` désactive la sélection de texte pendant le glissé. */
  protected readonly editorPct = signal(64);
  protected readonly dragging = signal(false);
  /** Repli du panneau chat : l'éditeur reprend toute la largeur. */
  protected readonly chatCollapsed = signal(false);

  #initialized = false;

  constructor() {
    // Chat ancré : hook avant-tour posé une fois (flush d'autosave — l'instance
    // vit et meurt avec la page, route remountOnParamChange) ; la PORTÉE
    // (contexte selon le type du bloc) est posée à l'init-once ci-dessous,
    // quand le bloc est connu — les effects du composant tournent avant le
    // rafraîchissement du template, donc avant le montage du chat enfant et
    // son premier `loadConversations`.
    this.#assistantState.setBeforeTurn(() => this.flushContent());

    // Miroir du markdown pour le diff des propositions (l'init n'émet pas).
    this.content.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.contentMarkdown.set(value));

    // Revue HITL refermée (proposition consommée ou abandonnée) : état de
    // décision remis à zéro et, pour un bloc TEXTE, le focus revient à
    // l'éditeur une fois le champ re-visible (setTimeout : la classe de
    // masquage tombe au même tour de rendu) — un Ctrl-Z immédiat atteint
    // Monaco et retire l'application sans clic préalable. Exercice : la
    // question appliquée est dépliée par l'éditeur, pas de focus rendu.
    let reviewingKind: string | null = null;
    effect(() => {
      const pending = this.proposals.pending();
      if (reviewingKind !== null && pending === null) {
        this.proposals.reset();
        if (reviewingKind === 'block_text' && this.#isBrowser) {
          setTimeout(() => this.markdownField()?.focusEditor(), 0);
        }
      }
      reviewingKind = pending?.kind ?? null;
    });

    // Init UNIQUE quand le bloc à contenu éditable arrive ; jamais ré-initialisé
    // ensuite (le patch du détail après un save ne doit pas écraser la frappe).
    // Texte : le contrôle est posé ici ; exercice : l'éditeur enfant s'initialise
    // lui-même depuis `[initial]`, seule la référence de save est figée ici. La
    // portée du chat ancré suit le type (texte → block_text, exercice →
    // block_exercise) — les autres types n'ont pas de chat.
    effect(() => {
      const block = this.block();
      if (this.#initialized || block === null) {
        return;
      }
      if (block.type === 'text') {
        const markdown = block.content['markdown'];
        const initial = typeof markdown === 'string' ? markdown : '';
        this.#initialized = true;
        this.#autosave.init({ markdown: initial });
        this.content.setValue(initial, { emitEvent: false });
        this.contentMarkdown.set(initial);
        this.#assistantState.configure({ context: 'block_text', blockId: this.blockId });
      } else if (block.type === 'exercise') {
        this.#initialized = true;
        this.#autosave.init(payloadFromBlockContent(block.content));
        this.#assistantState.configure({ context: 'block_exercise', blockId: this.blockId });
        // Résumé des tentatives des élèves (tuteur IA) — une fois par page.
        void this.#submissions.loadSummary(this.courseId, this.blockId);
      } else if (block.type === 'document') {
        this.#initialized = true;
        this.#autosave.init(payloadFromDocumentContent(block.content));
      }
    });

    // Bibliothèque du cours chargée UNE FOIS pour tout bloc à contenu éditable :
    // picker de ressource du bloc document, mais aussi picker d'insertion et
    // résolution de l'aperçu des blocs texte/exercice (markdown-field).
    effect(() => {
      const type = this.block()?.type;
      const needsResources = type === 'text' || type === 'exercise' || type === 'document';
      if (needsResources && !this.#resourcesRequested) {
        this.#resourcesRequested = true;
        this.#resources.loadList(this.courseId);
      }
    });

    // Bibliothèque de modules chargée UNE FOIS : picker du bloc module, mais
    // aussi picker d'insertion `oc-module:` des blocs texte/exercice
    // (markdown-field) et résolution de leur aperçu.
    effect(() => {
      const type = this.block()?.type;
      const needsModules = type === 'text' || type === 'exercise' || type === 'module';
      if (needsModules && !this.#modulesRequested) {
        this.#modulesRequested = true;
        this.#modules.loadList(this.courseId);
      }
    });

    // Applique les réglages de style enregistrés du cours dès que le détail
    // arrive (l'aperçu du markdown-field porte le bouton flottant en contexte
    // cours). Idempotent sur le même cours — ne clobbe pas une édition en vol.
    effect(() => {
      const detail = this.detail();
      if (detail?.id === this.courseId) {
        this.#courseStyle.load(this.courseId, detail.preview_settings);
      }
    });

    // Init UNIQUE du formulaire méta (tous types) depuis le bloc chargé ; la
    // référence de complétude est figée au même instant.
    effect(() => {
      const block = this.block();
      if (this.#metaInitialized || block === null) {
        return;
      }
      this.#metaInitialized = true;
      patchBlockMetaForm(this.metaForm, block);
      this.#savedPayload.set(payloadFromBlockMetaForm(this.metaForm));
    });

    // Ré-éditer efface le badge « Enregistré/Échec » (mais pas pendant un save).
    this.metaForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.metaSaveState() !== 'saving') {
        this.metaSaveState.set('idle');
      }
    });
  }

  ngOnInit(): void {
    if (!this.#isBrowser) {
      return;
    }
    this.reload();
  }

  ngOnDestroy(): void {
    // Sortie avant la fin du debounce : flush fire-and-forget (le service
    // root survit au composant).
    this.#autosave.flushOnDestroy();
  }

  /** Relayé par le template : chaque frappe de l'éditeur d'exercice alimente
      le pipeline d'autosave (le payload transmis ne sert que de déclencheur). */
  protected onExerciseDraft(payload: ExerciseContentPayload): void {
    this.#exerciseDrafts.next(payload);
  }

  /** Effacement des tentatives des élèves (question ou exercice entier) demandé
      par l'éditeur d'exercice : appel puis toast (nombre effacé, ou échec). */
  protected async onSubmissionsClear(request: { questionId: string | null }): Promise<void> {
    try {
      const deleted = await this.#submissions.clear(
        this.courseId,
        this.blockId,
        request.questionId,
      );
      this.#notifications.success(
        this.#transloco.translate('courses.editor.exercise.submissions.cleared', {
          count: deleted,
        }),
      );
    } catch {
      this.#notifications.error(
        this.#transloco.translate('courses.editor.exercise.submissions.clearError'),
      );
    }
  }

  /** Frappes légende/affichage du bloc document — même pipeline d'autosave. */
  protected onDocumentDraft(payload: DocumentContentPayload): void {
    this.#documentDrafts.next(payload);
  }

  /**
   * Choix (ou retrait) de la ressource d'un bloc document : PATCH immédiat —
   * une sélection est discrète, pas une frappe, elle ne passe pas par le
   * debounce. Sur échec, le select est rétabli à la valeur du bloc.
   */
  protected async onResourcePick(resourceId: string | null): Promise<void> {
    const previous = this.block()?.resource_id ?? null;
    if (resourceId === previous) {
      return;
    }
    this.resourceSaveError.set(false);
    try {
      await this.#courses.updateBlockResource(this.courseId, this.blockId, resourceId);
    } catch {
      this.resourceSaveError.set(true);
      this.documentEditor()?.resetResource(previous);
    }
  }

  /**
   * Choix (ou retrait) du module d'un bloc module : PATCH immédiat — miroir
   * d'`onResourcePick`. Sur échec, le select est rétabli à la valeur du bloc.
   */
  protected async onModulePick(moduleId: string | null): Promise<void> {
    const previous = this.block()?.module_id ?? null;
    if (moduleId === previous) {
      return;
    }
    this.moduleSaveError.set(false);
    try {
      await this.#courses.updateBlockModule(this.courseId, this.blockId, moduleId);
    } catch {
      this.moduleSaveError.set(true);
      this.moduleBlockEditor()?.resetModule(previous);
    }
  }

  protected reload(): void {
    this.#courses.loadDetail(this.courseId);
  }

  /** Lien vers l'éditeur d'un autre bloc du cours — la route porte
      `remountOnParamChange` : le flush d'autosave du destroy tourne, puis l'init. */
  protected blockNavLink(block: CourseBlock): string[] {
    return ['/', this.language.lang(), 'courses', this.courseId, 'blocks', block.id];
  }

  /** Clic « Bloc suivant » (haut ou bas) : la lecture reprend en haut de la
      page remontée — « précédent » conserve, lui, la position de défilement. */
  protected scrollToTop(): void {
    if (this.#isBrowser) {
      window.scrollTo({ top: 0 });
    }
  }

  #neighbour(delta: number): CourseBlock | null {
    const index = this.blockIndex();
    return index === 0 ? null : (this.blocks()[index - 1 + delta] ?? null);
  }

  /** Enregistre titre/description (tous types). N'envoie que le méta, jamais le contenu. */
  protected async saveMeta(): Promise<void> {
    if (!this.canSaveMeta()) {
      return;
    }
    const payload = payloadFromBlockMetaForm(this.metaForm);
    this.metaSaveState.set('saving');
    try {
      await this.#courses.updateBlockMeta(this.courseId, this.blockId, payload);
      this.#savedPayload.set(payload);
      this.metaSaveState.set('saved');
    } catch {
      this.metaSaveState.set('error');
    }
  }

  protected toggleChat(): void {
    this.chatCollapsed.update((collapsed) => !collapsed);
  }

  /**
   * Flush immédiat de l'autosave — hook avant-tour du chat ancré : le back
   * bâtit le contexte IA depuis le bloc EN BASE, le debounce ne doit pas lui
   * faire lire un état périmé. No-op si rien n'a changé ; un échec remonte au
   * hook (avalé là-bas — envoi non bloquant, le badge d'autosave signale déjà
   * le problème).
   */
  async flushContent(): Promise<void> {
    await this.#autosave.flush();
  }

  /**
   * Application d'une réécriture de bloc texte acceptée : le markdown proposé
   * est appliqué VIA l'éditeur Monaco (`MarkdownField.replaceAll` —
   * `executeEdits`, l'édit entre dans la pile d'annulation : **Ctrl-Z le
   * retire** comme une frappe, et la propagation CVA alimente dirty +
   * autosave), avec repli `content.setValue` si Monaco n'est pas prêt (jsdom,
   * éditeur en chargement — sans undo, assumé).
   */
  #applyText(markdown: string): void {
    if (!(this.markdownField()?.replaceAll(markdown) ?? false)) {
      this.content.setValue(markdown);
    }
  }

  /**
   * Application d'une proposition d'exercice acceptée — une opération unitaire
   * déléguée à l'éditeur d'exercice (qui écrit via Monaco quand il le peut,
   * révèle la question et laisse l'autosave partir). `false` = cible
   * introuvable ou éditeur absent : rien n'est appliqué.
   */
  #applyExercise(proposal: ExerciseProposal): boolean {
    const editor = this.exerciseEditor();
    if (!editor) {
      return false;
    }
    switch (proposal.kind) {
      case 'exercise_statement':
        return editor.applyStatement(proposal.statement);
      case 'exercise_question_edit':
        return editor.applyQuestionEdit(proposal.questionId, {
          statement: proposal.statement,
          expectedAnswer: proposal.expectedAnswer,
        });
      case 'exercise_question_add':
        return editor.applyQuestionAdd({
          statement: proposal.statement,
          expectedAnswer: proposal.expectedAnswer,
          afterId: proposal.afterId,
        });
      case 'exercise_question_delete':
        return editor.applyQuestionDelete(proposal.questionId);
    }
  }

  /** Payload de contenu courant selon le type du bloc (`null` = pas d'éditeur). */
  #currentPayload(): Record<string, unknown> | null {
    const block = this.block();
    if (block?.type === 'text') {
      return { markdown: this.content.value };
    }
    if (block?.type === 'exercise') {
      const editor = this.exerciseEditor();
      return editor ? payloadFromExerciseForm(editor.form) : null;
    }
    if (block?.type === 'document') {
      const editor = this.documentEditor();
      return editor ? payloadFromDocumentForm(editor.form) : null;
    }
    return null;
  }

  /**
   * Envoi d'un payload par l'autosave. Pour un exercice, les ids générés par
   * le back sont réécrits sur un snapshot des groupes capturé à l'envoi
   * (aligné 1:1 sur le payload, même si des questions bougent pendant le vol)
   * et le payload canonique persisté devient la référence de l'autosave.
   */
  async #persist(payload: Record<string, unknown>): Promise<Record<string, unknown> | void> {
    const editor = this.block()?.type === 'exercise' ? this.exerciseEditor() : undefined;
    const groups = editor ? [...editor.form.controls.questions.controls] : [];
    const saved = await this.#courses.updateBlockContent(this.courseId, this.blockId, payload);
    if (editor) {
      const savedPayload = payloadFromBlockContent(saved.content);
      applyGeneratedIds(groups, savedPayload);
      return savedPayload;
    }
  }
}
