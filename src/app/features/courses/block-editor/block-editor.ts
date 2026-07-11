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
import { TranslocoPipe } from '@jsverse/transloco';
import { concatMap, debounceTime, merge, Subject, tap } from 'rxjs';
import {
  buildBlockMetaForm,
  patchBlockMetaForm,
  payloadFromBlockMetaForm,
} from '../../../core/courses/block-meta-form';
import {
  BlockMetaPayload,
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
import { CourseService } from '../../../core/courses/course.service';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { MarkdownField } from '../../../shared/markdown-field/markdown-field';
import { CourseChat } from '../course-chat/course-chat';
import { DocumentEditor } from '../document-editor/document-editor';
import { ExerciseEditor } from '../exercise-editor/exercise-editor';

const AUTOSAVE_DELAY_MS = 1500;

/** Bornes du partage éditeur/chat (en % de largeur de la colonne éditeur). */
const MIN_EDITOR_PCT = 15;
const MAX_EDITOR_PCT = 85;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type MetaSaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Coquille-page d'édition d'un bloc : en-tête, formulaire titre/description
 * (tous types, enregistrement explicite), et — pour les blocs texte et
 * exercice — indicateur d'autosave et espace de travail redimensionnable
 * (éditeur de contenu + assistant). Le contenu est délégué par type :
 * `app-markdown-field` (texte), `app-exercise-editor` (exercice) ; l'autosave
 * débouncé reste ici, dans un pipeline unique. Le payload est construit **à
 * l'envoi** (état courant du formulaire, ids de questions déjà réécrits) —
 * jamais à l'émission — et les ids générés par le back sont réécrits après
 * chaque save sur un snapshot des groupes capturé à l'envoi (sinon l'autosave
 * suivant renverrait `id: null` et casserait la stabilité des ids).
 * Les blocs document ont une section simple (pas d'espace redimensionnable ni
 * de chat) : `app-document-editor` — légende/affichage passent par le même
 * pipeline d'autosave, mais le choix de la ressource est un PATCH immédiat
 * dédié (`updateBlockResource`), avec revert du select sur échec. Le bloc
 * `module` n'a pas d'éditeur avant le J4 (notice `unsupported`).
 */
@Component({
  selector: 'app-block-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    MarkdownField,
    CourseChat,
    DocumentEditor,
    ExerciseEditor,
  ],
  templateUrl: './block-editor.html',
  styleUrl: './block-editor.scss',
})
export class BlockEditor implements OnInit, OnDestroy {
  readonly #courses = inject(CourseService);
  readonly #courseStyle = inject(CourseStyleService);
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

  /**
   * Contenu markdown édité (blocs texte), relayé au `app-markdown-field`.
   * Public — exception à la convention `protected` : jsdom ne peut pas taper
   * dans monaco, les specs pilotent ce contrôle.
   */
  readonly content = new FormControl('', { nonNullable: true });

  /** Éditeur d'exercice monté (blocs exercice) — son `form` public est piloté
      ici pour le write-back des ids et le flush à la destruction. */
  protected readonly exerciseEditor = viewChild(ExerciseEditor);

  /** Éditeur de document monté (blocs document) — `form` lu à l'envoi du PATCH,
      `resetResource` appelé sur échec du PATCH de ressource. */
  protected readonly documentEditor = viewChild(DocumentEditor);

  /** Frappes de l'éditeur d'exercice, fusionnées dans le pipeline d'autosave. */
  readonly #exerciseDrafts = new Subject<ExerciseContentPayload>();

  /** Frappes de l'éditeur de document (légende/affichage), même pipeline. */
  readonly #documentDrafts = new Subject<DocumentContentPayload>();

  protected readonly saveState = signal<SaveState>('idle');

  readonly #resources = inject(ResourceService);
  /** Ressources `disponible` du cours, proposées au picker du bloc document. */
  protected readonly availableResources = computed(() =>
    this.#resources.list().filter((r) => r.statut === 'disponible'),
  );
  /** Échec du PATCH de ressource (canal distinct de l'autosave du contenu). */
  protected readonly resourceSaveError = signal(false);
  #resourcesRequested = false;

  /**
   * Titre/description du bloc (tous types) — enregistrement explicite (bouton),
   * indépendant de l'autosave du contenu. `#savedPayload` est la référence de
   * complétude « modifié » (snapshot JSON, motif page profil).
   */
  protected readonly metaForm = buildBlockMetaForm();
  readonly #metaValue = toSignal(this.metaForm.valueChanges, {
    initialValue: this.metaForm.getRawValue(),
  });
  readonly #savedPayload = signal<BlockMetaPayload>({ titre: null, description: null });
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
  /** JSON du dernier payload persisté (référence dirty/idle, tous types). */
  #lastSaved = '';
  /** Dernier payload frappé — repli du flush si l'éditeur enfant est déjà détruit. */
  #lastDraft: Record<string, unknown> | null = null;

  constructor() {
    // Init UNIQUE quand le bloc à contenu éditable arrive ; jamais ré-initialisé
    // ensuite (le patch du détail après un save ne doit pas écraser la frappe).
    // Texte : le contrôle est posé ici ; exercice : l'éditeur enfant s'initialise
    // lui-même depuis `[initial]`, seule la référence de save est figée ici.
    effect(() => {
      const block = this.block();
      if (this.#initialized || block === null) {
        return;
      }
      if (block.type === 'texte') {
        const markdown = block.content['markdown'];
        const initial = typeof markdown === 'string' ? markdown : '';
        this.#initialized = true;
        this.#lastSaved = JSON.stringify({ markdown: initial });
        this.content.setValue(initial, { emitEvent: false });
      } else if (block.type === 'exercice') {
        this.#initialized = true;
        this.#lastSaved = JSON.stringify(payloadFromBlockContent(block.content));
      } else if (block.type === 'document') {
        this.#initialized = true;
        this.#lastSaved = JSON.stringify(payloadFromDocumentContent(block.content));
      }
    });

    // Bibliothèque du cours chargée UNE FOIS pour tout bloc à contenu éditable :
    // picker de ressource du bloc document, mais aussi picker d'insertion et
    // résolution de l'aperçu des blocs texte/exercice (markdown-field).
    effect(() => {
      const type = this.block()?.type;
      const needsResources = type === 'texte' || type === 'exercice' || type === 'document';
      if (needsResources && !this.#resourcesRequested) {
        this.#resourcesRequested = true;
        this.#resources.loadList(this.courseId);
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

    merge(this.content.valueChanges, this.#exerciseDrafts, this.#documentDrafts)
      .pipe(
        tap(() => {
          const payload = this.#currentPayload();
          this.#lastDraft = payload ?? this.#lastDraft;
          this.saveState.set(JSON.stringify(payload) === this.#lastSaved ? 'idle' : 'dirty');
        }),
        debounceTime(AUTOSAVE_DELAY_MS),
        // concatMap sérialise les PATCH : la promesse n'est pas annulable,
        // switchMap laisserait une réponse périmée écraser la plus récente.
        // Le payload est relu à l'ENVOI (état courant, ids à jour) — les
        // émissions ne servent que de déclencheur.
        concatMap(() => this.#save()),
        takeUntilDestroyed(),
      )
      .subscribe();

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
    if (!this.#initialized) {
      return;
    }
    const payload = this.#currentPayload() ?? this.#lastDraft;
    if (payload !== null && JSON.stringify(payload) !== this.#lastSaved) {
      void this.#courses
        .updateBlockContent(this.courseId, this.blockId, payload)
        .catch(() => undefined);
    }
  }

  /** Relayé par le template : chaque frappe de l'éditeur d'exercice alimente
      le pipeline d'autosave (le payload transmis ne sert que de déclencheur). */
  protected onExerciseDraft(payload: ExerciseContentPayload): void {
    this.#exerciseDrafts.next(payload);
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

  protected reload(): void {
    this.#courses.loadDetail(this.courseId);
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

  #clampPct(value: number): number {
    return Math.min(MAX_EDITOR_PCT, Math.max(MIN_EDITOR_PCT, value));
  }

  /**
   * Redimensionne la colonne éditeur via la poignée. On capture le pointeur sur
   * le divider (monaco ne vole pas les events pendant le glissé) et on dérive
   * l'axe du flex-direction réel : row (desktop) → X, column (mobile empilé) → Y.
   */
  protected startDrag(event: PointerEvent): void {
    event.preventDefault();
    const divider = event.currentTarget as HTMLElement;
    const container = divider.closest('.block-editor__workspace') as HTMLElement | null;
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

  /** Payload de contenu courant selon le type du bloc (`null` = pas d'éditeur). */
  #currentPayload(): Record<string, unknown> | null {
    const block = this.block();
    if (block?.type === 'texte') {
      return { markdown: this.content.value };
    }
    if (block?.type === 'exercice') {
      const editor = this.exerciseEditor();
      return editor ? payloadFromExerciseForm(editor.form) : null;
    }
    if (block?.type === 'document') {
      const editor = this.documentEditor();
      return editor ? payloadFromDocumentForm(editor.form) : null;
    }
    return null;
  }

  async #save(): Promise<void> {
    const isExercise = this.block()?.type === 'exercice';
    const editor = this.exerciseEditor();
    const payload = this.#currentPayload();
    if (payload === null) {
      return;
    }
    const serialized = JSON.stringify(payload);
    if (serialized === this.#lastSaved) {
      // Émission en file devenue redondante (frappe annulée ou déjà persistée).
      return;
    }
    // Snapshot des groupes aligné 1:1 sur le payload envoyé : le write-back
    // des ids reste correct même si des questions bougent pendant le vol.
    const groups = isExercise && editor ? [...editor.form.controls.questions.controls] : [];
    this.saveState.set('saving');
    try {
      const saved = await this.#courses.updateBlockContent(this.courseId, this.blockId, payload);
      if (isExercise) {
        // Sans ce write-back, l'autosave suivant renverrait `id: null` et le
        // back régénérerait des ids censés être stables à vie.
        const savedPayload = payloadFromBlockContent(saved.content);
        applyGeneratedIds(groups, savedPayload);
        this.#lastSaved = JSON.stringify(savedPayload);
        this.#lastDraft = this.#currentPayload() ?? this.#lastDraft;
      } else {
        this.#lastSaved = serialized;
      }
      // Frappe pendant le save en vol : on reste « dirty », le suivant est en file.
      this.saveState.set(JSON.stringify(this.#currentPayload()) === this.#lastSaved ? 'saved' : 'dirty');
    } catch {
      // Le flux survit ; retentative à la prochaine modification.
      this.saveState.set('error');
    }
  }
}
