import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ExerciseContentPayload } from '../../../core/courses/course.model';
import {
  addQuestion,
  buildExerciseForm,
  ExerciseQuestionGroup,
  fullExerciseMarkdown,
  moveQuestion,
  moveQuestionTo,
  patchExerciseFormFromContent,
  payloadFromExerciseForm,
  questionEnoncePreview,
  QUESTIONS_MAX,
  removeQuestion,
} from '../../../core/courses/exercise-form';
import { MarkdownField } from '../../../shared/markdown-field/markdown-field';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';

/** Suffixe d'ids uniques par instance (tablist ARIA — motif `markdown-field`).
    Compteur de module, jamais Date/Random. */
let sequence = 0;

type ExerciseTab = 'sujet' | 'questions' | 'apercu';

/** Ordre des onglets pour la navigation clavier ←/→ (APG tabs). */
const TAB_ORDER: readonly ExerciseTab[] = ['sujet', 'questions', 'apercu'];

/**
 * Éditeur du contenu d'un bloc exercice, en trois onglets (tablist APG, motif
 * `markdown-field`) : « Sujet » (markdown), « Questions » (liste ordonnée —
 * énoncé markdown, réponse attendue en texte simple) et « Aperçu complet »
 * (rendu concaténé sujet + énoncés). Les panneaux Sujet/Questions sont masqués
 * par `[hidden]`, jamais `@if` : Monaco vit dans les deux, un `@if` le
 * rechargerait à chaque bascule ; le panneau Aperçu, sans Monaco, est en `@if`
 * (patron `markdown-field`). Composant présentationnel sans HTTP — le parent
 * (block-editor) écoute `contentChange` pour son autosave et réécrit les ids
 * générés par le back directement dans `form` (cf. `applyGeneratedIds`). La
 * suppression d'une question est en deux temps, désarmée au blur (patron
 * `course-blocks`). L'aperçu réutilise le pipeline de `markdown-field` (rendu
 * synchrone markdown+KaTeX puis passe Mermaid async, gardé sur l'onglet et le
 * navigateur — DOMPurify/Mermaid touchent `window`).
 */
@Component({
  selector: 'app-exercise-editor',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    MarkdownField,
    MarkdownView,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    CdkDragPlaceholder,
  ],
  templateUrl: './exercise-editor.html',
  styleUrl: './exercise-editor.scss',
})
export class ExerciseEditor {
  /** `content` JSONB du bloc chargé — lu UNE fois (init-once, jamais re-patché :
      la référence change après chaque patch du détail post-save, la frappe
      en cours ne doit pas être écrasée). */
  readonly initial = input.required<Record<string, unknown>>();
  readonly contentChange = output<ExerciseContentPayload>();

  /**
   * Cours propriétaire des ressources — descendu à chaque `app-markdown-field`
   * (picker d'insertion + résolution de l'aperçu) et à l'aperçu complet. `null`
   * (défaut) hors contexte cours.
   */
  readonly courseId = input<string | null>(null);

  /**
   * Formulaire de l'exercice. Public — exception à la convention `protected` :
   * jsdom ne peut pas taper dans monaco, les specs et le block-editor
   * (write-back des ids) pilotent ce formulaire.
   */
  readonly form = buildExerciseForm();

  /** Préfixe d'ids ARIA propre à l'instance. */
  protected readonly uid = `exercise-editor-${sequence++}`;

  protected readonly activeTab = signal<ExerciseTab>('sujet');
  protected readonly sujetTabRef = viewChild<ElementRef<HTMLButtonElement>>('sujetTab');
  protected readonly questionsTabRef = viewChild<ElementRef<HTMLButtonElement>>('questionsTab');
  protected readonly apercuTabRef = viewChild<ElementRef<HTMLButtonElement>>('apercuTab');

  /** Markdown concaténé (sujet + énoncés) alimentant l'aperçu complet ; dérivé
      du formulaire (frappe en cours), pas du `content` initial du bloc. Rendu
      par `app-markdown-view` (pipeline markdown+KaTeX+Mermaid partagé). */
  readonly #fullMarkdown = signal('');
  protected readonly fullMarkdown = this.#fullMarkdown.asReadonly();
  protected readonly hasContent = computed(() => this.#fullMarkdown().length > 0);

  /** Groupes rendus par le template : la structure de la FormArray n'est pas
      un signal, ce miroir est resynchronisé à chaque mutation structurelle. */
  protected readonly questionGroups = signal<ExerciseQuestionGroup[]>([]);

  /** Question dépliée dans l'accordéon (une seule à la fois), suivie par
      référence de groupe — robuste aux déplacements/suppressions puisque
      `moveQuestion` réutilise l'instance de contrôle. `null` = tout replié. */
  protected readonly openGroup = signal<ExerciseQuestionGroup | null>(null);

  /** Index de la question « armée » pour suppression (le 2e clic confirme). */
  protected readonly pendingDelete = signal<number | null>(null);

  protected readonly maxReached = signal(false);

  #initialized = false;

  constructor() {
    effect(() => {
      const content = this.initial();
      if (this.#initialized) {
        return;
      }
      this.#initialized = true;
      patchExerciseFormFromContent(this.form, content);
      this.#syncGroups();
      this.#fullMarkdown.set(fullExerciseMarkdown(this.form));
      // Première question dépliée au chargement (confort d'édition immédiat).
      this.openGroup.set(this.form.controls.questions.controls[0] ?? null);
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.contentChange.emit(payloadFromExerciseForm(this.form));
      this.#fullMarkdown.set(fullExerciseMarkdown(this.form));
    });
  }

  protected selectTab(tab: ExerciseTab): void {
    this.activeTab.set(tab);
  }

  /** Flèches gauche/droite : cycle d'onglet + déplacement du focus (APG tabs). */
  protected onTablistKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const current = TAB_ORDER.indexOf(this.activeTab());
    const next = TAB_ORDER[(current + delta + TAB_ORDER.length) % TAB_ORDER.length];
    this.activeTab.set(next);
    const ref =
      next === 'sujet'
        ? this.sujetTabRef()
        : next === 'questions'
          ? this.questionsTabRef()
          : this.apercuTabRef();
    ref?.nativeElement.focus();
  }

  /** Accordéon : déplie la question ; recliquer sur celle ouverte la replie. */
  protected toggleQuestion(group: ExerciseQuestionGroup): void {
    this.openGroup.update((current) => (current === group ? null : group));
  }

  /** Aperçu de l'énoncé affiché dans l'en-tête d'une question repliée. Lu au
      rendu (déclenché par `openGroup`/`questionGroups`) : à jour au repli. */
  protected preview(group: ExerciseQuestionGroup): string {
    return questionEnoncePreview(group.controls.enonce.value);
  }

  protected add(): void {
    if (this.form.controls.questions.length >= QUESTIONS_MAX) {
      return;
    }
    addQuestion(this.form);
    this.#syncGroups();
    // Déplie la question fraîchement ajoutée pour l'éditer aussitôt.
    const controls = this.form.controls.questions.controls;
    this.openGroup.set(controls[controls.length - 1] ?? null);
  }

  /** Supprime en deux temps : le premier clic arme, le second confirme. */
  protected remove(index: number): void {
    if (this.pendingDelete() !== index) {
      this.pendingDelete.set(index);
      return;
    }
    removeQuestion(this.form, index);
    this.#syncGroups();
    // Si la question dépliée a disparu, déplie le voisin restant à sa place.
    if (this.openGroup() === null) {
      const controls = this.form.controls.questions.controls;
      this.openGroup.set(controls[Math.min(index, controls.length - 1)] ?? null);
    }
  }

  /** Quitter le bouton armé (focus ailleurs) annule la suppression. */
  protected disarmDelete(): void {
    this.pendingDelete.set(null);
  }

  protected move(index: number, delta: 1 | -1): void {
    moveQuestion(this.form, index, delta);
    this.#syncGroups();
  }

  /** Fin d'un glisser-déposer : réordonne de `previousIndex` vers `currentIndex`. */
  protected drop(event: CdkDragDrop<ExerciseQuestionGroup[]>): void {
    moveQuestionTo(this.form, event.previousIndex, event.currentIndex);
    this.#syncGroups();
  }

  /** Clavier sur la poignée : ↑/↓ un cran, Début/Fin aux extrémités. */
  protected onHandleKeydown(event: KeyboardEvent, index: number): void {
    const count = this.form.controls.questions.length;
    const to =
      event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'ArrowDown'
          ? index + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : null;
    if (to === null) {
      return;
    }
    event.preventDefault();
    moveQuestionTo(this.form, index, to);
    this.#syncGroups();
  }

  #syncGroups(): void {
    this.pendingDelete.set(null);
    const groups = [...this.form.controls.questions.controls];
    this.questionGroups.set(groups);
    this.maxReached.set(this.form.controls.questions.length >= QUESTIONS_MAX);
    // Une référence dépliée devenue obsolète (question supprimée) est neutralisée.
    const open = this.openGroup();
    if (open && !groups.includes(open)) {
      this.openGroup.set(null);
    }
  }
}
