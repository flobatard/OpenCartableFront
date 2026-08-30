import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  publicAccessFromRoute,
  publicCourseSegments,
} from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import {
  answerStorage,
  answerStorageKey,
  clearAnswers,
  readAnswers,
  StoredAnswer,
  writeAnswers,
} from '../../../core/student/answer-storage';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';
import { Spinner } from '../../../shared/spinner/spinner';

/** Question affichable (formes inattendues du JSONB filtrées). */
interface ExerciseQuestion {
  id: string;
  statement: string;
}

/** Délai d'autosave localStorage après une frappe (ms). */
const SAVE_DEBOUNCE_MS = 500;

/**
 * Écran de résolution d'un bloc exercice par l'élève (J2) — page publique du
 * même régime d'accès que la vue cours (`shared/:token` ou `p/courses/:id`).
 * Sujet puis questions : énoncé rendu en markdown (`app-markdown-view`, les
 * `oc-resource:` passent par le résolveur public de la route), réponse en
 * zone de texte libre.
 *
 * Les réponses vivent en **localStorage uniquement** (aucune requête
 * serveur — cf. `core/student/answer-storage`) : autosave débouncé après la
 * frappe, « Marquer comme terminé » verrouille une question (readonly +
 * badge), « Effacer mes réponses » en deux temps désarmé au blur. Storage
 * indisponible → notice, la saisie reste possible mais non persistée. Le
 * corrigé du prof n'existe pas dans le payload reçu (filtré par le back).
 * Client-only (`RenderMode.Client`).
 */
@Component({
  selector: 'app-student-exercise',
  imports: [TranslocoPipe, RouterLink, MarkdownView, Spinner],
  templateUrl: './student-exercise.html',
  styleUrl: './student-exercise.scss',
})
export class StudentExercise implements OnDestroy {
  readonly #courses = inject(PublicCourseService);
  readonly #route = inject(ActivatedRoute);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Params en snapshot (convention repo) : cible de lien externe.
  readonly #access = publicAccessFromRoute(this.#route);
  readonly #blockId = this.#route.snapshot.paramMap.get('blockId') ?? '';

  readonly #storage = this.#isBrowser ? answerStorage() : null;
  /** Persistance indisponible (navigation privée stricte, quota) : notice. */
  protected readonly storageOk = signal(true);

  protected readonly loading = this.#courses.detailLoading;
  protected readonly detail = this.#courses.detail;

  /** Bloc exercice ciblé, ou `null` (inconnu / pas un exercice). */
  protected readonly block = computed(() => {
    const detail = this.detail();
    return (
      detail?.blocks.find((b) => b.id === this.#blockId && b.type === 'exercise') ?? null
    );
  });

  /** Accès refusé, bloc introuvable ou route mal formée : message générique. */
  protected readonly error = computed(
    () =>
      this.#access === null ||
      this.#blockId === '' ||
      this.#courses.detailError() ||
      (this.detail() !== null && this.block() === null),
  );

  /** Sujet de l'exercice (`content.statement`, gardé string). */
  protected readonly statement = computed(() => {
    const content = this.block()?.content;
    return typeof content?.['statement'] === 'string' ? content['statement'] : '';
  });

  /** Questions affichables (id + énoncé), dans l'ordre du back. */
  protected readonly questions = computed<ExerciseQuestion[]>(() => {
    const content = this.block()?.content;
    const raw = Array.isArray(content?.['questions']) ? content['questions'] : [];
    return raw.flatMap((q: unknown) => {
      if (typeof q !== 'object' || q === null) {
        return [];
      }
      const { id, statement } = q as { id?: unknown; statement?: unknown };
      return typeof id === 'string'
        ? [{ id, statement: typeof statement === 'string' ? statement : '' }]
        : [];
    });
  });

  /** Réponses par id de question — source de vérité de l'écran. */
  protected readonly answers = signal<Record<string, StoredAnswer>>({});

  /** « Effacer mes réponses » armé (deux temps, désarmé au blur). */
  protected readonly clearArmed = signal(false);

  /** Vrai dès qu'au moins une réponse est enregistrée sur l'appareil. */
  protected readonly hasAnswers = computed(
    () => Object.values(this.answers()).some((a) => a.text !== '' || a.locked),
  );

  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #restoredKey: string | null = null;

  constructor() {
    if (this.#isBrowser && this.#access !== null) {
      void this.#courses.loadCourse(this.#access);
    }
    // Restaure les réponses persistées dès que le bloc est là (une fois par clé).
    effect(() => {
      const block = this.block();
      const detail = this.detail();
      if (block === null || detail === null) {
        return;
      }
      const key = answerStorageKey(detail.id, block.id);
      if (this.#restoredKey === key) {
        return;
      }
      this.#restoredKey = key;
      this.answers.set(readAnswers(this.#storage, key).answers);
      this.storageOk.set(this.#storage !== null);
    });
  }

  ngOnDestroy(): void {
    // Flush : une frappe dont le debounce n'a pas expiré part quand même.
    if (this.#saveTimer !== null) {
      clearTimeout(this.#saveTimer);
      this.#persist();
    }
  }

  /** Retour vers la vue cours du même régime d'accès. */
  protected backLink(): string[] | null {
    return this.#access === null
      ? null
      : ['/', this.#language.lang(), ...publicCourseSegments(this.#access)];
  }

  /** Réponse courante d'une question (chaîne vide si jamais saisie). */
  protected answerText(questionId: string): string {
    return this.answers()[questionId]?.text ?? '';
  }

  /** Question marquée « terminée » (textarea verrouillée). */
  protected isLocked(questionId: string): boolean {
    return this.answers()[questionId]?.locked === true;
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
    this.#persist();
  }

  /** Efface tout (deux temps : premier clic arme, second confirme). */
  protected clearAll(): void {
    if (!this.clearArmed()) {
      this.clearArmed.set(true);
      return;
    }
    this.clearArmed.set(false);
    this.answers.set({});
    if (this.#restoredKey !== null) {
      clearAnswers(this.#storage, this.#restoredKey);
    }
  }

  /** Désarme la confirmation d'effacement quand le bouton perd le focus. */
  protected disarmClear(): void {
    this.clearArmed.set(false);
  }

  #scheduleSave(): void {
    if (!this.#isBrowser) {
      return;
    }
    if (this.#saveTimer !== null) {
      clearTimeout(this.#saveTimer);
    }
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      this.#persist();
    }, SAVE_DEBOUNCE_MS);
  }

  #persist(): void {
    if (this.#restoredKey === null) {
      return;
    }
    const ok = writeAnswers(this.#storage, this.#restoredKey, {
      version: 2,
      answers: this.answers(),
    });
    this.storageOk.set(ok);
  }
}
