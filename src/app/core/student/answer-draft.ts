import { computed, signal } from '@angular/core';
import {
  answerStorage,
  clearAnswers,
  readAnswers,
  StoredAnswer,
  writeAnswers,
} from './answer-storage';

/** Délai d'autosave localStorage après une frappe (ms). */
export const ANSWER_SAVE_DEBOUNCE_MS = 500;

/**
 * Brouillon local des réponses d'un bloc exercice (mode résolution) : état en
 * signaux + persistance localStorage débouncée (`answer-storage`). Une
 * instance par vue ; `restore(key)` recharge les réponses d'une clé
 * `(courseId, blockId)` en flushant d'abord la frappe en attente de la
 * précédente. Hors navigateur, rien n'est persisté (saisie en mémoire seule).
 */
export class AnswerDraft {
  /** Réponses par id de question — source de vérité de l'écran. */
  readonly answers = signal<Record<string, StoredAnswer>>({});
  /** Persistance indisponible (navigation privée stricte, quota) : mode dégradé. */
  readonly storageOk = signal(true);
  /** Vrai dès qu'au moins une réponse est saisie ou verrouillée. */
  readonly hasAnswers = computed(() =>
    Object.values(this.answers()).some((a) => a.text !== '' || a.locked),
  );

  readonly #browser: boolean;
  /** localStorage, résolu paresseusement au premier besoin. */
  #storage: Storage | null | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #key: string | null = null;

  constructor(browser: boolean) {
    this.#browser = browser;
  }

  /** Clé des réponses affichées ; `null` tant qu'aucune restauration n'a eu lieu. */
  get key(): string | null {
    return this.#key;
  }

  /** Charge les réponses persistées sous `key` (après flush de la clé précédente). */
  restore(key: string): void {
    this.flush();
    this.#key = key;
    const storage = this.#resolveStorage();
    this.answers.set(readAnswers(storage, key).answers);
    this.storageOk.set(storage !== null);
  }

  /** Réponse courante d'une question (chaîne vide si jamais saisie). */
  text(questionId: string): string {
    return this.answers()[questionId]?.text ?? '';
  }

  /** Question marquée « terminée » (zone de réponse verrouillée). */
  isLocked(questionId: string): boolean {
    return this.answers()[questionId]?.locked === true;
  }

  /** Frappe dans la zone de réponse : état en mémoire + autosave débouncé. */
  setText(questionId: string, value: string): void {
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
  toggleLocked(questionId: string): void {
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

  /** Efface toutes les réponses (mémoire et storage). */
  clear(): void {
    this.#cancelScheduledSave();
    this.answers.set({});
    if (this.#key !== null) {
      clearAnswers(this.#resolveStorage(), this.#key);
    }
  }

  /** Persiste tout de suite une sauvegarde en attente (destroy, changement de clé). */
  flush(): void {
    if (this.#saveTimer !== null) {
      this.#cancelScheduledSave();
      this.#persist();
    }
  }

  #resolveStorage(): Storage | null {
    if (this.#storage === undefined) {
      this.#storage = this.#browser ? answerStorage() : null;
    }
    return this.#storage;
  }

  #scheduleSave(): void {
    if (!this.#browser) {
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

  /** Écrit les réponses courantes sous la clé restaurée. */
  #persist(): void {
    if (this.#key === null) {
      return;
    }
    const ok = writeAnswers(this.#resolveStorage(), this.#key, {
      version: 2,
      answers: this.answers(),
    });
    this.storageOk.set(ok);
  }
}
