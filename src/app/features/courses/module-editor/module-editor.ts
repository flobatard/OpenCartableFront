import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { concatMap, debounceTime, merge, tap } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleUpdatePayload } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';
import { MarkdownEditor } from '../../../shared/markdown-editor/markdown-editor';
import { ModuleRunner } from '../../../shared/module-runner/module-runner';

const AUTOSAVE_DELAY_MS = 1500;

/** Frappe → preview : un peu plus large que le playground (400 ms) car chaque
 *  recomposition RECHARGE l'iframe sandbox (srcdoc), pas juste un re-rendu. */
const PREVIEW_DEBOUNCE_MS = 500;

type CodeTab = 'html' | 'css' | 'js';
const TAB_ORDER: readonly CodeTab[] = ['html', 'css', 'js'];

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Ids ARIA uniques par instance (compteur de module, jamais Date.now()). */
let sequence = 0;

/**
 * Éditeur d'un module interactif (`courses/:id/modules/:moduleId`) : trois
 * Monaco HTML | CSS | JS commutés par tabs (panneaux masqués par `[hidden]`,
 * jamais `@if` — Monaco vit dans les trois) et preview live sandboxée
 * (`app-module-runner`) côte à côte (grid 50/50 motif markdown-playground,
 * empilé <900px), alimentée par la frappe débouncée. Autosave débouncé
 * unique (motif block-editor : `merge → debounceTime → concatMap`, payload
 * relu à l'ENVOI, flush fire-and-forget au destroy) via le PATCH partiel
 * `updateModule` (code sans titre — le renommage vit dans l'onglet Modules).
 *
 * Les trois `FormControl` sont publics (exception à la convention
 * `protected`) : jsdom ne peut pas taper dans Monaco, les specs les
 * pilotent. Route en RenderMode.Client (Monaco + iframe), params en
 * snapshot.
 */
@Component({
  selector: 'app-module-editor',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, MarkdownEditor, ModuleRunner],
  templateUrl: './module-editor.html',
  styleUrl: './module-editor.scss',
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
  protected readonly titre = signal('');

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

  #initialized = false;
  /** JSON du dernier payload persisté (référence dirty/idle). */
  #lastSaved = '';
  /** PATCH d'autosave en vol (concatMap n'en laisse qu'un à la fois) — le
   *  flush du destroy s'enchaîne derrière lui, sinon deux écritures
   *  concurrentes dont l'ordre serveur n'est pas garanti pourraient persister
   *  l'ancien code. Toujours résolue (jamais rejetée). */
  #inFlightSave: Promise<void> = Promise.resolve();

  constructor() {
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
        this.titre.set(module.titre);
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
