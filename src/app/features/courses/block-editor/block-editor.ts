import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { concatMap, debounceTime, tap } from 'rxjs';
import { CourseService } from '../../../core/courses/course.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { MarkdownField } from '../../../shared/markdown-field/markdown-field';
import { CourseChat } from '../course-chat/course-chat';

const AUTOSAVE_DELAY_MS = 1500;

/** Bornes du partage éditeur/chat (en % de largeur de la colonne éditeur). */
const MIN_EDITOR_PCT = 15;
const MAX_EDITOR_PCT = 85;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Coquille-page d'édition d'un bloc texte : en-tête, indicateur d'autosave,
 * espace de travail redimensionnable (champ markdown + assistant) et états de
 * chargement. Le contenu (éditeur Monaco, onglets, aperçu, aide) est délégué au
 * composant réutilisable `app-markdown-field` ; l'autosave débouncé reste ici.
 * Les autres types de blocs auront leurs éditeurs dédiés plus tard.
 */
@Component({
  selector: 'app-block-editor',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, MarkdownField, CourseChat],
  templateUrl: './block-editor.html',
  styleUrl: './block-editor.scss',
})
export class BlockEditor implements OnInit, OnDestroy {
  readonly #courses = inject(CourseService);
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
   * Contenu markdown édité, relayé au `app-markdown-field`. Public — exception à
   * la convention `protected` : jsdom ne peut pas taper dans monaco, les specs
   * pilotent ce contrôle.
   */
  readonly content = new FormControl('', { nonNullable: true });

  protected readonly saveState = signal<SaveState>('idle');

  /** Partage de largeur éditeur/chat piloté par la poignée (drag), en % de la
      colonne éditeur ; `dragging` désactive la sélection de texte pendant le glissé. */
  protected readonly editorPct = signal(64);
  protected readonly dragging = signal(false);
  /** Repli du panneau chat : l'éditeur reprend toute la largeur. */
  protected readonly chatCollapsed = signal(false);

  #initialized = false;
  #lastSaved = '';

  constructor() {
    // Init UNIQUE du contrôle quand le bloc texte arrive ; jamais réécrit
    // ensuite (le patch du détail après un save ne doit pas écraser la frappe).
    effect(() => {
      const block = this.block();
      if (this.#initialized || block === null || block.type !== 'texte') {
        return;
      }
      const markdown = block.content['markdown'];
      const initial = typeof markdown === 'string' ? markdown : '';
      this.#initialized = true;
      this.#lastSaved = initial;
      this.content.setValue(initial, { emitEvent: false });
    });

    this.content.valueChanges
      .pipe(
        tap((value) => {
          this.saveState.set(value === this.#lastSaved ? 'idle' : 'dirty');
        }),
        debounceTime(AUTOSAVE_DELAY_MS),
        // concatMap sérialise les PATCH : la promesse n'est pas annulable,
        // switchMap laisserait une réponse périmée écraser la plus récente.
        concatMap((value) => this.#save(value)),
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
    // Sortie avant la fin du debounce : flush fire-and-forget (le service
    // root survit au composant).
    if (this.#initialized && this.content.value !== this.#lastSaved) {
      void this.#courses
        .updateBlockContent(this.courseId, this.blockId, { markdown: this.content.value })
        .catch(() => undefined);
    }
  }

  protected reload(): void {
    this.#courses.loadDetail(this.courseId);
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

  async #save(value: string): Promise<void> {
    if (value === this.#lastSaved) {
      return;
    }
    this.saveState.set('saving');
    try {
      await this.#courses.updateBlockContent(this.courseId, this.blockId, { markdown: value });
      this.#lastSaved = value;
      // Frappe pendant le save en vol : on reste « dirty », le suivant est en file.
      this.saveState.set(this.content.value === value ? 'saved' : 'dirty');
    } catch {
      // Le flux survit ; retentative à la prochaine modification.
      this.saveState.set('error');
    }
  }
}
