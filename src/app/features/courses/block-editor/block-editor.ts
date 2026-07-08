import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { marked } from 'marked';
import { concatMap, debounceTime, tap } from 'rxjs';
import { CourseService } from '../../../core/courses/course.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { MarkdownEditor } from '../../../shared/markdown-editor/markdown-editor';

const AUTOSAVE_DELAY_MS = 1500;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type EditorTab = 'editor' | 'preview';

/**
 * Éditeur du contenu d'un bloc texte (markdown, Monaco) : onglets
 * Éditeur | Aperçu (rendu local via marked) et autosave débouncé avec
 * indicateur d'état. Les autres types de blocs auront leurs éditeurs
 * dédiés plus tard.
 */
@Component({
  selector: 'app-block-editor',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, MarkdownEditor],
  templateUrl: './block-editor.html',
  styleUrl: './block-editor.scss',
})
export class BlockEditor implements OnInit, OnDestroy {
  readonly #courses = inject(CourseService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #route = inject(ActivatedRoute);
  /** Params lus en snapshot (pas de withComponentInputBinding dans ce projet). */
  protected readonly courseId = this.#route.snapshot.paramMap.get('id') ?? '';
  readonly #blockId = this.#route.snapshot.paramMap.get('blockId') ?? '';

  protected readonly language = inject(LanguageService);

  protected readonly detail = this.#courses.detail;
  protected readonly loading = this.#courses.detailLoading;
  protected readonly loadError = this.#courses.detailError;

  /** Bloc édité, résolu dans le détail chargé (`null` = introuvable). */
  protected readonly block = computed(
    () => this.detail()?.blocks.find((b) => b.id === this.#blockId) ?? null,
  );

  /**
   * Contenu markdown édité. Public — exception à la convention `protected` :
   * jsdom ne peut pas taper dans monaco, les specs pilotent ce contrôle.
   */
  readonly content = new FormControl('', { nonNullable: true });

  protected readonly saveState = signal<SaveState>('idle');
  protected readonly activeTab = signal<EditorTab>('editor');

  protected readonly editorTabRef = viewChild<ElementRef<HTMLButtonElement>>('editorTab');
  protected readonly previewTabRef = viewChild<ElementRef<HTMLButtonElement>>('previewTab');

  /** Valeur locale en cours de frappe — alimente l'aperçu (pas la version sauvegardée). */
  readonly #draft = signal('');
  protected readonly hasDraft = computed(() => this.#draft().trim().length > 0);
  /** HTML de l'aperçu — sanitisé par le binding [innerHTML] d'Angular (jamais de bypass). */
  protected readonly previewHtml = computed(() => marked.parse(this.#draft(), { async: false }));

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
      this.#draft.set(initial);
      this.content.setValue(initial, { emitEvent: false });
    });

    this.content.valueChanges
      .pipe(
        tap((value) => {
          this.#draft.set(value);
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
        .updateBlockContent(this.courseId, this.#blockId, { markdown: this.content.value })
        .catch(() => undefined);
    }
  }

  protected reload(): void {
    this.#courses.loadDetail(this.courseId);
  }

  protected selectTab(tab: EditorTab): void {
    this.activeTab.set(tab);
  }

  /** Flèches gauche/droite : bascule d'onglet + déplacement du focus (APG tabs). */
  protected onTablistKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next: EditorTab = this.activeTab() === 'editor' ? 'preview' : 'editor';
    this.activeTab.set(next);
    const ref = next === 'editor' ? this.editorTabRef() : this.previewTabRef();
    ref?.nativeElement.focus();
  }

  async #save(value: string): Promise<void> {
    if (value === this.#lastSaved) {
      return;
    }
    this.saveState.set('saving');
    try {
      await this.#courses.updateBlockContent(this.courseId, this.#blockId, { markdown: value });
      this.#lastSaved = value;
      // Frappe pendant le save en vol : on reste « dirty », le suivant est en file.
      this.saveState.set(this.content.value === value ? 'saved' : 'dirty');
    } catch {
      // Le flux survit ; retentative à la prochaine modification.
      this.saveState.set('error');
    }
  }
}
