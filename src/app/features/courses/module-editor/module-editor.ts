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
import { concatMap, debounceTime, merge, tap } from 'rxjs';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { ProposalHost } from '../../../core/course-assistant/proposal-host';
import {
  AssistantModuleProposal,
  MODULE_FILE_BY_KIND,
  ModuleProposalFile,
} from '../../../core/course-assistant/proposals';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleUpdatePayload } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';
import { MarkdownEditor } from '../../../shared/markdown-editor/markdown-editor';
import { ModuleRunner } from '../../../shared/module-runner/module-runner';
import { CourseChat } from '../course-chat/course-chat';
import { ModuleProposalReview } from './module-proposal-review';

const AUTOSAVE_DELAY_MS = 1500;

/** Bornes du partage panes/chat (en % de largeur de l'espace de travail). */
const MIN_EDITOR_PCT = 15;
const MAX_EDITOR_PCT = 85;

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

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Ids ARIA uniques par instance (compteur de module, jamais Date.now()). */
let sequence = 0;

/**
 * Éditeur d'un module interactif (`courses/:id/modules/:moduleId`) : trois
 * Monaco HTML | CSS | JS commutés par tabs (panneaux masqués par `[hidden]`,
 * jamais `@if` — Monaco vit dans les trois) et preview live sandboxée
 * (`app-module-runner`) côte à côte (grid 50/50 motif markdown-playground,
 * empilé <900px), alimentée par la frappe débouncée. Cette grille et le
 * panneau assistant (`app-course-chat` en mode edit, contexte `module`)
 * composent un espace de travail redimensionnable au motif block-editor :
 * poignée `separator` pilotant `--editor-basis`, repli `[hidden]` (les panes
 * reprennent toute la largeur), bouton de réouverture sous 900px. Autosave
 * débouncé unique (motif block-editor : `merge → debounceTime → concatMap`,
 * payload relu à l'ENVOI, flush fire-and-forget au destroy) via le PATCH
 * partiel `updateModule` (code sans titre — le renommage vit dans l'onglet
 * Modules).
 *
 * **Chat d'édition HITL** (contexte back `module`) : instance
 * d'`AssistantChatState` dédiée (`providers`), portée posée au constructeur
 * (params en snapshot — la route `remountOnParamChange` recrée la page avec
 * son état) et `setBeforeTurn(flushContent)` pour que le back lise le module
 * EN BASE à chaque tour et à chaque décision. Quand l'IA propose un fichier,
 * `ProposalHost` dérive `review` et la revue REMPLACE le pane éditeur (masqué
 * par classe, jamais `@if` : Monaco survit) tandis que le pane **aperçu
 * exécute déjà le code proposé** (`previewCode` — c'est l'atout du contexte
 * module : on voit le résultat avant d'accepter). L'acceptation applique le
 * fichier via Monaco (édit entre undo stops : **Ctrl-Z l'annule**, repli
 * `setValue` sans undo si Monaco n'est pas prêt), l'autosave persiste.
 *
 * Les trois `FormControl` sont publics (exception à la convention
 * `protected`) : jsdom ne peut pas taper dans Monaco, les specs les
 * pilotent. Route en RenderMode.Client (Monaco + iframe), params en
 * snapshot.
 */
@Component({
  selector: 'app-module-editor',
  imports: [
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

  protected readonly saveState = signal<SaveState>('idle');

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
      Motif block-editor — défaut plus large ici : la colonne porte DEUX panes. */
  protected readonly editorPct = signal(68);
  protected readonly dragging = signal(false);
  /** Repli du panneau assistant : les panes reprennent toute la largeur. */
  protected readonly chatCollapsed = signal(false);

  #initialized = false;
  /** JSON du dernier payload persisté (référence dirty/idle). */
  #lastSaved = '';
  /** PATCH d'autosave en vol (concatMap n'en laisse qu'un à la fois) — le
   *  flush du destroy s'enchaîne derrière lui, sinon deux écritures
   *  concurrentes dont l'ordre serveur n'est pas garanti pourraient persister
   *  l'ancien code. Toujours résolue (jamais rejetée). */
  #inFlightSave: Promise<void> = Promise.resolve();

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
    merge(this.htmlControl.valueChanges, this.cssControl.valueChanges, this.jsControl.valueChanges)
      .pipe(
        tap(() => {
          this.saveState.set(
            JSON.stringify(this.#currentPayload()) === this.#lastSaved ? 'idle' : 'dirty',
          );
        }),
        debounceTime(AUTOSAVE_DELAY_MS),
        // concatMap sérialise les PATCH (promesse non annulable — switchMap
        // laisserait une réponse périmée écraser la plus récente). Le payload
        // est relu à l'ENVOI, les émissions ne sont que des déclencheurs.
        concatMap(() => this.#save()),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  ngOnInit(): void {
    if (!this.#isBrowser) {
      return;
    }
    this.reload();
  }

  ngOnDestroy(): void {
    // Sortie avant la fin du debounce : flush fire-and-forget (service root),
    // enchaîné derrière l'éventuel PATCH en vol pour garantir l'ordre serveur
    // (takeUntilDestroyed annule la file du concatMap, pas la requête partie).
    if (!this.#initialized) {
      return;
    }
    const payload = this.#currentPayload();
    if (JSON.stringify(payload) !== this.#lastSaved) {
      void this.#inFlightSave.then(() =>
        this.#modules.updateModule(this.courseId, this.moduleId, payload).catch(() => undefined),
      );
    }
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
          this.#lastSaved = JSON.stringify({ html: module.html, css: module.css, js: module.js });
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

  /** Cyclage ←/→ du tablist APG (roving tabindex, motif markdown-field). */
  protected onTablistKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const index = TAB_ORDER.indexOf(this.activeTab());
    const delta = event.key === 'ArrowLeft' ? -1 : 1;
    const next = TAB_ORDER[(index + delta + TAB_ORDER.length) % TAB_ORDER.length];
    this.activeTab.set(next);
    (document.getElementById(`${this.uid}-tab-${next}`) as HTMLButtonElement | null)?.focus();
  }

  protected toggleChat(): void {
    this.chatCollapsed.update((collapsed) => !collapsed);
  }

  #clampPct(value: number): number {
    return Math.min(MAX_EDITOR_PCT, Math.max(MIN_EDITOR_PCT, value));
  }

  /**
   * Redimensionne la colonne des panes via la poignée (motif block-editor) :
   * pointeur capturé sur le divider (monaco ne vole pas les events pendant le
   * glissé), axe dérivé du flex-direction réel — row (desktop) → X, column
   * (mobile empilé) → Y.
   */
  protected startDrag(event: PointerEvent): void {
    event.preventDefault();
    const divider = event.currentTarget as HTMLElement;
    const container = divider.closest('.module-editor__workspace') as HTMLElement | null;
    if (!container) {
      return;
    }
    const isVertical = getComputedStyle(container).flexDirection === 'column';
    this.dragging.set(true);
    divider.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent): void => {
      const rect = container.getBoundingClientRect();
      const pct = isVertical
        ? ((e.clientY - rect.top) / rect.height) * 100
        : ((e.clientX - rect.left) / rect.width) * 100;
      this.editorPct.set(this.#clampPct(pct));
    };
    const onUp = (): void => {
      this.dragging.set(false);
      if (divider.hasPointerCapture(event.pointerId)) {
        divider.releasePointerCapture(event.pointerId);
      }
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
      divider.removeEventListener('pointercancel', onUp);
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
    divider.addEventListener('pointercancel', onUp);
  }

  /** Clavier sur la poignée (separator WAI-ARIA) : ± un pas, ou extrêmes. */
  protected onDividerKeydown(event: KeyboardEvent): void {
    const step = 2;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this.editorPct.set(this.#clampPct(this.editorPct() - step));
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this.editorPct.set(this.#clampPct(this.editorPct() + step));
        break;
      case 'Home':
        this.editorPct.set(MIN_EDITOR_PCT);
        break;
      case 'End':
        this.editorPct.set(MAX_EDITOR_PCT);
        break;
      default:
        return;
    }
    event.preventDefault();
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
    await this.#save();
  }

  /** Code courant des trois contrôles (payload du PATCH partiel, sans titre). */
  #currentPayload(): ModuleUpdatePayload {
    return {
      html: this.htmlControl.value,
      css: this.cssControl.value,
      js: this.jsControl.value,
    };
  }

  async #save(): Promise<void> {
    if (!this.#initialized) {
      return;
    }
    const payload = this.#currentPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === this.#lastSaved) {
      // Émission en file devenue redondante (frappe annulée ou déjà persistée).
      return;
    }
    this.saveState.set('saving');
    try {
      const request = this.#modules.updateModule(this.courseId, this.moduleId, payload);
      this.#inFlightSave = request.then(
        () => undefined,
        () => undefined,
      );
      await request;
      this.#lastSaved = serialized;
      // Frappe pendant le save en vol : on reste « dirty », le suivant est en file.
      this.saveState.set(
        JSON.stringify(this.#currentPayload()) === this.#lastSaved ? 'saved' : 'dirty',
      );
    } catch {
      // Le flux survit ; retentative à la prochaine modification.
      this.saveState.set('error');
    }
  }
}
