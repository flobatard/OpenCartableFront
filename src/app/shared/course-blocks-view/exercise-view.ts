import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { exerciseViewFromContent } from '../../core/courses/exercise-form';
import {
  answerStorage,
  answerStorageKey,
  clearAnswers,
  readAnswers,
  StoredAnswer,
  writeAnswers,
} from '../../core/student/answer-storage';
import { CorrectionRequest, QuestionCorrection } from '../../core/student/exercise-correction';
import { MarkdownView } from '../markdown-view/markdown-view';
import { Spinner } from '../spinner/spinner';

/** Rendu d'un bloc exercice : aperçu en lecture seule, ou résolution par l'élève. */
export type ExerciseViewMode = 'preview' | 'solve';

/** Délai d'autosave localStorage après une frappe (ms). */
export const ANSWER_SAVE_DEBOUNCE_MS = 500;

/**
 * Rendu partagé d'un bloc `exercise` — sujet puis questions **une à une**, en
 * cartes numérotées « Question n » — à deux modes :
 *
 * - **`preview`** (défaut — Aperçu prof, « Cours entier » et son PDF) : sujet
 *   et énoncés seuls, aucune zone de réponse, localStorage jamais touché ;
 * - **`solve`** (le bloc seul de la vue élève, `blocks/:blockId`) : une zone de
 *   réponse par question, « Marquer comme terminé » (verrouille la zone),
 *   « Effacer mes réponses » en deux temps désarmé au blur, réponses en
 *   **localStorage uniquement** (`core/student/answer-storage`, clé
 *   `(courseId, blockId)`, une entrée par id de question) : autosave débouncé
 *   après la frappe, flush au destroy **et au changement de clé** — la vue est
 *   robuste à un changement d'inputs, même si `CourseBlocksView` la recrée par
 *   `track block.id`. Storage indisponible → notice, la saisie reste possible
 *   mais non persistée.
 *
 * **Slot de correction IA (dormant)** : une entrée de `corrections` par id de
 * question — `pending` (spinner) / `done` (retour en markdown) / `error` —,
 * rien de rendu sans entrée ; le bouton « Demander une correction » n'existe
 * que sous `correctionEnabled` (défaut `false` : l'appel IA élève n'est pas
 * branché, cf. TODO.md) et émet `correctionRequested`.
 *
 * Présentational : aucun service métier injecté (invariant vue élève —
 * `courseId`/`blockId` viennent des inputs, les `oc-resource:` des énoncés
 * passent par le résolveur de la route via `app-markdown-view`). Le corrigé
 * (`expected_answer`) n'est jamais lu (`exerciseViewFromContent`) — et côté
 * routes publiques, le back ne le sert même pas. Les markdown-views internes
 * n'affichent ni bouton d'impression ni réglages : le PDF du cours entier et
 * le style de lecture (variables posées en `[style]`) sont portés par l'hôte.
 * Client-only (markdown-view).
 */
@Component({
  selector: 'app-exercise-view',
  imports: [TranslocoPipe, MarkdownView, Spinner],
  templateUrl: './exercise-view.html',
  styleUrl: './exercise-view.scss',
})
export class ExerciseView implements OnDestroy {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** `content` JSONB du bloc exercice (forme tolérée, cf. `exerciseViewFromContent`). */
  readonly content = input.required<Record<string, unknown>>();
  /** Cours du bloc : résolution des `oc-resource:` et clé des réponses. */
  readonly courseId = input.required<string>();
  /** Bloc rendu : clé des réponses persistées. */
  readonly blockId = input.required<string>();
  readonly mode = input<ExerciseViewMode>('preview');
  /** Affiche le bouton « Demander une correction » (appel IA à brancher). */
  readonly correctionEnabled = input(false);
  /** Corrections par id de question ; aucune entrée = rien de rendu. */
  readonly corrections = input<Readonly<Record<string, QuestionCorrection>>>({});
  readonly correctionRequested = output<CorrectionRequest>();

  protected readonly view = computed(() => exerciseViewFromContent(this.content()));
  protected readonly solving = computed(() => this.mode() === 'solve');

  /** Réponses par id de question — source de vérité de l'écran (mode solve). */
  protected readonly answers = signal<Record<string, StoredAnswer>>({});
  /** Persistance indisponible (navigation privée stricte, quota) : notice. */
  protected readonly storageOk = signal(true);
  /** « Effacer mes réponses » armé (deux temps, désarmé au blur). */
  protected readonly clearArmed = signal(false);
  /** Vrai dès qu'au moins une réponse est enregistrée sur l'appareil. */
  protected readonly hasAnswers = computed(() =>
    Object.values(this.answers()).some((a) => a.text !== '' || a.locked),
  );

  /** localStorage, résolu paresseusement au premier besoin (mode solve, navigateur). */
  #storage: Storage | null | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Clé des réponses affichées ; `null` tant qu'aucune restauration n'a eu lieu. */
  #restoredKey: string | null = null;

  constructor() {
    // Restaure les réponses persistées dès que la clé (cours, bloc) est
    // connue, une fois par clé — en flushant d'abord la frappe en attente de
    // la précédente. Ne dépend que du mode et de la clé : jamais d'`answers()`
    // ici (sinon re-run à chaque frappe).
    effect(() => {
      if (this.mode() !== 'solve') {
        return;
      }
      const key = answerStorageKey(this.courseId(), this.blockId());
      if (this.#restoredKey === key) {
        return;
      }
      untracked(() => {
        this.#flush();
        this.#restoredKey = key;
        const storage = this.#resolveStorage();
        this.answers.set(readAnswers(storage, key).answers);
        this.storageOk.set(storage !== null);
        this.clearArmed.set(false);
      });
    });
  }

  ngOnDestroy(): void {
    // Flush : une frappe dont le debounce n'a pas expiré part quand même.
    this.#flush();
  }

  /** Réponse courante d'une question (chaîne vide si jamais saisie). */
  protected answerText(questionId: string): string {
    return this.answers()[questionId]?.text ?? '';
  }

  /** Question marquée « terminée » (zone de réponse verrouillée). */
  protected isLocked(questionId: string): boolean {
    return this.answers()[questionId]?.locked === true;
  }

  /** Correction de la question, ou `undefined` (jamais demandée). */
  protected correctionFor(questionId: string): QuestionCorrection | undefined {
    return this.corrections()[questionId];
  }

  /** Bouton « Demander une correction » : activé, réponse saisie, rien en cours. */
  protected canRequestCorrection(questionId: string): boolean {
    return (
      this.solving() &&
      this.correctionEnabled() &&
      this.answerText(questionId).trim() !== '' &&
      this.correctionFor(questionId)?.status !== 'pending'
    );
  }

  protected requestCorrection(questionId: string): void {
    this.correctionRequested.emit({
      blockId: this.blockId(),
      questionId,
      answer: this.answerText(questionId),
    });
  }

  /** Frappe dans la zone de réponse : état en mémoire + autosave débouncé. */
  protected onAnswerInput(questionId: string, value: string): void {
    this.answers.update((answers) => ({
      ...answers,
      [questionId]: {
        text: value,
        locked: answers[questionId]?.locked === true,
        updatedAt: new Date().toISOString(),
      },
    }));
    this.#scheduleSave();
  }

  /** Bascule « Marquer comme terminé » / « Modifier » (persistée immédiatement). */
  protected toggleLocked(questionId: string): void {
    this.answers.update((answers) => ({
      ...answers,
      [questionId]: {
        text: answers[questionId]?.text ?? '',
        locked: answers[questionId]?.locked !== true,
        updatedAt: new Date().toISOString(),
      },
    }));
    this.#cancelScheduledSave();
    this.#persist();
  }

  /** Efface tout (deux temps : premier clic arme, second confirme). */
  protected clearAll(): void {
    if (!this.clearArmed()) {
      this.clearArmed.set(true);
      return;
    }
    this.clearArmed.set(false);
    this.#cancelScheduledSave();
    this.answers.set({});
    if (this.#restoredKey !== null) {
      clearAnswers(this.#resolveStorage(), this.#restoredKey);
    }
  }

  /** Désarme la confirmation d'effacement quand le bouton perd le focus. */
  protected disarmClear(): void {
    this.clearArmed.set(false);
  }

  #resolveStorage(): Storage | null {
    if (this.#storage === undefined) {
      this.#storage = this.#isBrowser ? answerStorage() : null;
    }
    return this.#storage;
  }

  #scheduleSave(): void {
    if (!this.#isBrowser) {
      return;
    }
    this.#cancelScheduledSave();
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      this.#persist();
    }, ANSWER_SAVE_DEBOUNCE_MS);
  }

  #cancelScheduledSave(): void {
    if (this.#saveTimer !== null) {
      clearTimeout(this.#saveTimer);
      this.#saveTimer = null;
    }
  }

  /** Persiste tout de suite une sauvegarde en attente (destroy, changement de clé). */
  #flush(): void {
    if (this.#saveTimer !== null) {
      this.#cancelScheduledSave();
      this.#persist();
    }
  }

  /** Écrit les réponses courantes sous la clé restaurée. */
  #persist(): void {
    if (this.#restoredKey === null) {
      return;
    }
    const ok = writeAnswers(this.#resolveStorage(), this.#restoredKey, {
      version: 2,
      answers: this.answers(),
    });
    this.storageOk.set(ok);
  }
}
