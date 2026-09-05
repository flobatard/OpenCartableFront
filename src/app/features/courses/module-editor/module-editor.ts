import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, merge } from 'rxjs';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { ProposalHost } from '../../../core/course-assistant/proposal-host';
import {
  AssistantModuleProposal,
  MODULE_FILE_BY_KIND,
  ModuleProposalFile,
} from '../../../core/course-assistant/proposals';
import { createAutosave } from '../../../core/editing/autosave';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleUpdatePayload } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';
import { MarkdownEditor } from '../../../shared/markdown-editor/markdown-editor';
import { ModuleRunner } from '../../../shared/module-runner/module-runner';
import { ResizeHandle } from '../../../shared/resize-handle/resize-handle.directive';
import { Tablist } from '../../../shared/tabs/tablist.directive';
import { CourseChat } from '../../course-assistant/course-chat/course-chat';
import { ModuleProposalReview } from '../../course-assistant/proposal-review/module-proposal-review';

/** Frappe → preview : un peu plus large que le playground (400 ms) car chaque
 *  recomposition RECHARGE l'iframe sandbox (srcdoc), pas juste un re-rendu. */
const PREVIEW_DEBOUNCE_MS = 500;

/** Un onglet de code = un fichier du module = une cible de proposition. */
type CodeTab = ModuleProposalFile;
const TAB_ORDER: readonly CodeTab[] = ['html', 'css', 'js'];

/** Revue affichée à la place du pane éditeur : la proposition + le code figé. */
interface ModuleReviewView {
  proposal: AssistantModuleProposal;
  file: CodeTab;
  original: string;
}

/** Ids ARIA uniques par instance (compteur de module, jamais Date.now()). */
let sequence = 0;

/**
 * Éditeur d'un module interactif (`courses/:id/modules/:moduleId`) : trois
 * Monaco HTML | CSS | JS commutés par onglets (panneaux masqués par `[hidden]`,
 * jamais `@if` — Monaco vit dans les trois) et aperçu live sandboxé
 * (`app-module-runner`) alimenté par la frappe débouncée, composés avec le
 * chat d'édition (contexte `module`) dans un espace de travail redimensionnable
 * au motif block-editor. Autosave unique (`createAutosave`) par le PATCH
 * partiel `updateModule` — le renommage vit dans l'onglet Modules.
 *
 * Chat d'édition HITL : instance d'`AssistantChatState` dédiée, portée posée
 * au constructeur (params en snapshot, route `remountOnParamChange`), flush
 * d'autosave avant chaque tour et chaque décision. Une proposition de fichier
 * remplace le pane éditeur par sa revue (masqué par classe : Monaco survit)
 * tandis que l'aperçu **exécute déjà le code proposé** (`previewCode`) ;
 * l'acceptation applique le fichier via Monaco (édit annulable par Ctrl-Z,
 * repli `setValue` sans undo si Monaco n'est pas prêt).
 *
 * Les trois `FormControl` sont publics (exception à la convention
 * `protected`) : jsdom ne peut pas taper dans Monaco, les specs les pilotent.
 */
@Component({
  selector: 'app-module-editor',
  imports: [
    ResizeHandle,
    Tablist,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MarkdownEditor,
    ModuleRunner,
    CourseChat,
    ModuleProposalReview,
  ],
  templateUrl: './module-editor.html',
  styleUrl: './module-editor.scss',
  providers: [AssistantChatState],
})
export class ModuleEditor implements OnInit, OnDestroy {
  readonly #modules = inject(ModuleService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #route = inject(ActivatedRoute);
  /** Params lus en snapshot (pas de withComponentInputBinding dans ce projet). */
  protected readonly courseId = this.#route.snapshot.paramMap.get('id') ?? '';
  protected readonly moduleId = this.#route.snapshot.paramMap.get('moduleId') ?? '';

  protected readonly language = inject(LanguageService);
  protected readonly uid = `module-editor-${sequence++}`;

  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  /** Titre du module (en-tête) — le renommage vit dans l'onglet Modules. */
  protected readonly title = signal('');

  protected readonly activeTab = signal<CodeTab>('html');
  protected readonly tabs = TAB_ORDER;

  /** Publics : jsdom pilote les contrôles, jamais Monaco. */
  readonly htmlControl = new FormControl('', { nonNullable: true });
  readonly cssControl = new FormControl('', { nonNullable: true });
  readonly jsControl = new FormControl('', { nonNullable: true });

  /** Code affiché par la preview — seedé au chargement du module (les
   *  `setValue(…, emitEvent: false)` de l'init n'émettent pas sur
   *  `valueChanges`, sinon preview vide à l'ouverture), puis suit la frappe,
   *  débouncé (recharge l'iframe). */
  protected readonly previewHtml = signal('');
  protected readonly previewCss = signal('');
  protected readonly previewJs = signal('');
  /** La preview ne monte l'iframe qu'une fois le module chargé. */
  protected readonly previewReady = signal(false);

  /** Autosave des trois fichiers par le PATCH partiel (code sans titre). */
  readonly #autosave = createAutosave<ModuleUpdatePayload>({
    triggers: merge(
      this.htmlControl.valueChanges,
      this.cssControl.valueChanges,
      this.jsControl.valueChanges,
    ),
    current: () => this.#currentPayload(),
    save: (payload) =>
      this.#modules.updateModule(this.courseId, this.moduleId, payload).then(() => undefined),
  });
  protected readonly saveState = this.#autosave.state;

  /** Les trois Monaco, par fichier (application d'une proposition par édit
   *  annulable ; `undefined` tant que la vue n'est pas rendue). */
  protected readonly htmlEditor = viewChild<MarkdownEditor>('htmlEditor');
  protected readonly cssEditor = viewChild<MarkdownEditor>('cssEditor');
  protected readonly jsEditor = viewChild<MarkdownEditor>('jsEditor');

  readonly #assistantState = inject(AssistantChatState);

  /** Revue d'une proposition de code en attente de décision (cf. doc de classe). */
  protected readonly proposals = new ProposalHost<ModuleReviewView>({
    state: this.#assistantState,
    buildReview: (proposal) => {
      if (!proposal.kind.startsWith('module_')) {
        return null; // proposition d'un autre hôte : rien à revoir ici
      }
      const modular = proposal as AssistantModuleProposal;
      const file = MODULE_FILE_BY_KIND[modular.kind];
      // « Original » figé à l'instant de la proposition : le pane éditeur est
      // masqué pendant la revue, son contenu ne peut plus bouger.
      return { proposal: modular, file, original: untracked(() => this.#controlFor(file).value) };
    },
    apply: (proposal) => {
      const modular = proposal as AssistantModuleProposal;
      return this.#applyCode(MODULE_FILE_BY_KIND[modular.kind], modular.code);
    },
  });

  /**
   * Code envoyé à l'aperçu : celui de la frappe (débouncée), SAUF pendant une
   * revue où le fichier visé est remplacé par le code proposé — le professeur
   * voit tourner ce qu'il s'apprête à accepter. Le retour au code réel est
   * automatique (la revue se referme avec la proposition).
   */
  protected readonly previewCode = computed(() => {
    const base = { html: this.previewHtml(), css: this.previewCss(), js: this.previewJs() };
    const review = this.proposals.review();
    return review === null ? base : { ...base, [review.file]: review.proposal.code };
  });

  /** Partage de largeur panes/chat piloté par la poignée (drag), en % de
      l'espace de travail ; `dragging` désactive la sélection pendant le glissé.
      Défaut plus large qu'au block-editor : la colonne porte DEUX panes. */
  protected readonly editorPct = signal(68);
  protected readonly dragging = signal(false);
  /** Repli du panneau assistant : les panes reprennent toute la largeur. */
  protected readonly chatCollapsed = signal(false);

  #initialized = false;

  constructor() {
    // Portée du chat ancré posée AVANT tout chargement (l'enfant `app-course-chat`
    // charge ses conversations à son premier effect) ; le flush d'autosave est
    // awaité avant chaque tour ET avant chaque décision HITL.
    this.#assistantState.configure({ context: 'module', moduleId: this.moduleId });
    this.#assistantState.setBeforeTurn(() => this.flushContent());

    // Fermeture d'une revue (décision partie, ou proposition abandonnée) :
    // état de l'hôte remis à zéro et focus rendu à l'éditeur ré-affiché — un
    // Ctrl-Z immédiat doit atteindre Monaco sans clic préalable.
    let reviewingFile: CodeTab | null = null;
    effect(() => {
      const review = this.proposals.review();
      if (reviewingFile !== null && review === null) {
        this.proposals.reset();
        const file = reviewingFile;
        if (this.#isBrowser) {
          setTimeout(() => this.#editorFor(file)?.focusEditor(), 0);
        }
      }
      reviewingFile = review?.file ?? null;
    });

    for (const [control, preview] of [
      [this.htmlControl, this.previewHtml],
      [this.cssControl, this.previewCss],
      [this.jsControl, this.previewJs],
    ] as const) {
      control.valueChanges
        .pipe(debounceTime(PREVIEW_DEBOUNCE_MS), takeUntilDestroyed())
        .subscribe((value) => preview.set(value));
    }
  }

  ngOnInit(): void {
    if (!this.#isBrowser) {
      return;
    }
    this.reload();
  }

  ngOnDestroy(): void {
    // Sortie avant la fin du debounce : flush fire-and-forget (service root),
    // enchaîné derrière l'éventuel PATCH en vol.
    this.#autosave.flushOnDestroy();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.#modules.getModule(this.courseId, this.moduleId).then(
      (module) => {
        this.loading.set(false);
        this.title.set(module.title);
        // Init UNIQUE des contrôles depuis le module chargé ; jamais réécrits
        // ensuite (un patch du cache post-save n'écrase pas la frappe).
        if (!this.#initialized) {
          this.#initialized = true;
          this.#autosave.init({ html: module.html, css: module.css, js: module.js });
          this.htmlControl.setValue(module.html, { emitEvent: false });
          this.cssControl.setValue(module.css, { emitEvent: false });
          this.jsControl.setValue(module.js, { emitEvent: false });
          // Seed direct : emitEvent false n'alimente pas les valueChanges,
          // la preview doit refléter le code sauvegardé dès l'ouverture.
          this.previewHtml.set(module.html);
          this.previewCss.set(module.css);
          this.previewJs.set(module.js);
          this.previewReady.set(true);
        }
      },
      () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    );
  }

  protected selectTab(tab: CodeTab): void {
    this.activeTab.set(tab);
  }

  /** Onglet atteint au clavier (directive `ocTablist`). */
  protected onTabKey(key: string): void {
    if ((TAB_ORDER as readonly string[]).includes(key)) {
      this.selectTab(key as CodeTab);
    }
  }

  protected toggleChat(): void {
    this.chatCollapsed.update((collapsed) => !collapsed);
  }

  #controlFor(file: CodeTab): FormControl<string> {
    return file === 'html' ? this.htmlControl : file === 'css' ? this.cssControl : this.jsControl;
  }

  #editorFor(file: CodeTab): MarkdownEditor | undefined {
    return file === 'html'
      ? this.htmlEditor()
      : file === 'css'
        ? this.cssEditor()
        : this.jsEditor();
  }

  /**
   * Applique le code proposé au fichier visé : édit Monaco entre undo stops
   * (**Ctrl-Z l'annule** comme une frappe, et la propagation CVA alimente
   * l'autosave) ; repli `setValue` sans undo si Monaco n'est pas prêt (jsdom,
   * SSR). L'onglet du fichier est révélé : le professeur voit ce qui a changé.
   */
  #applyCode(file: CodeTab, code: string): boolean {
    if (!(this.#editorFor(file)?.replaceAll(code) ?? false)) {
      this.#controlFor(file).setValue(code);
    }
    this.activeTab.set(file);
    return true;
  }

  /**
   * Flush immédiat de l'autosave (hook avant-tour du chat) : le back bâtit le
   * contexte IA depuis le module EN BASE. No-op si rien n'a changé ; un échec
   * n'empêche pas l'envoi (le hook n'est jamais bloquant).
   */
  async flushContent(): Promise<void> {
    await this.#autosave.flush();
  }

  /** Code courant des trois contrôles (payload du PATCH partiel, sans titre). */
  #currentPayload(): ModuleUpdatePayload {
    return {
      html: this.htmlControl.value,
      css: this.cssControl.value,
      js: this.jsControl.value,
    };
  }
}
