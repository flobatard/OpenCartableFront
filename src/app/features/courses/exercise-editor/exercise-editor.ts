import { Component, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ExerciseContentPayload } from '../../../core/courses/course.model';
import {
  addQuestion,
  buildExerciseForm,
  ExerciseQuestionGroup,
  moveQuestion,
  patchExerciseFormFromContent,
  payloadFromExerciseForm,
  QUESTIONS_MAX,
  removeQuestion,
} from '../../../core/courses/exercise-form';
import { MarkdownField } from '../../../shared/markdown-field/markdown-field';

/** Suffixe d'ids uniques par instance (tablist ARIA — motif `markdown-field`).
    Compteur de module, jamais Date/Random. */
let sequence = 0;

type ExerciseTab = 'sujet' | 'questions';

/**
 * Éditeur du contenu d'un bloc exercice, en deux onglets (tablist APG, motif
 * `markdown-field`) : « Sujet » (markdown) et « Questions » (liste ordonnée —
 * énoncé markdown, réponse attendue en texte simple). Les panneaux sont
 * masqués par `[hidden]`, jamais `@if` : Monaco vit dans les deux, un `@if`
 * le rechargerait à chaque bascule. Composant présentationnel sans HTTP — le
 * parent (block-editor) écoute `contentChange` pour son autosave et réécrit
 * les ids générés par le back directement dans `form` (cf.
 * `applyGeneratedIds`). La suppression d'une question est en deux temps,
 * désarmée au blur (patron `course-blocks`).
 */
@Component({
  selector: 'app-exercise-editor',
  imports: [ReactiveFormsModule, TranslocoPipe, MarkdownField],
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

  /** Groupes rendus par le template : la structure de la FormArray n'est pas
      un signal, ce miroir est resynchronisé à chaque mutation structurelle. */
  protected readonly questionGroups = signal<ExerciseQuestionGroup[]>([]);

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
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.contentChange.emit(payloadFromExerciseForm(this.form));
    });
  }

  protected selectTab(tab: ExerciseTab): void {
    this.activeTab.set(tab);
  }

  /** Flèches gauche/droite : bascule d'onglet + déplacement du focus (APG tabs). */
  protected onTablistKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next: ExerciseTab = this.activeTab() === 'sujet' ? 'questions' : 'sujet';
    this.activeTab.set(next);
    const ref = next === 'sujet' ? this.sujetTabRef() : this.questionsTabRef();
    ref?.nativeElement.focus();
  }

  protected add(): void {
    if (this.form.controls.questions.length >= QUESTIONS_MAX) {
      return;
    }
    addQuestion(this.form);
    this.#syncGroups();
  }

  /** Supprime en deux temps : le premier clic arme, le second confirme. */
  protected remove(index: number): void {
    if (this.pendingDelete() !== index) {
      this.pendingDelete.set(index);
      return;
    }
    removeQuestion(this.form, index);
    this.#syncGroups();
  }

  /** Quitter le bouton armé (focus ailleurs) annule la suppression. */
  protected disarmDelete(): void {
    this.pendingDelete.set(null);
  }

  protected move(index: number, delta: 1 | -1): void {
    moveQuestion(this.form, index, delta);
    this.#syncGroups();
  }

  #syncGroups(): void {
    this.pendingDelete.set(null);
    this.questionGroups.set([...this.form.controls.questions.controls]);
    this.maxReached.set(this.form.controls.questions.length >= QUESTIONS_MAX);
  }
}
