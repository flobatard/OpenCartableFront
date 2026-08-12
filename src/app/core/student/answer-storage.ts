/**
 * Persistance locale des réponses d'exercice des élèves (J2) — localStorage
 * UNIQUEMENT : aucune soumission serveur à ce jalon (la table des soumissions
 * et la review IA arrivent au J5). Le schéma de clé référence
 * `(courseId, blockId, questionId)` : les `questions[].id` du back sont
 * stables à vie précisément pour ça — le J5 branchera ses soumissions sur les
 * mêmes identifiants sans migration des brouillons locaux.
 *
 * Helpers purs + garde d'accès : localStorage peut être indisponible
 * (navigation privée stricte, quota) — toute écriture retourne son succès,
 * l'appelant affiche un mode dégradé (saisie non persistée) au lieu de casser.
 */

/** Réponse d'une question, telle que persistée. */
export interface StoredAnswer {
  texte: string;
  /** Marquée « terminée » par l'élève (verrouillée à l'écran). */
  locked: boolean;
  /** ISO 8601 — informatif (affichage futur, arbitrage multi-appareils J5). */
  updatedAt: string;
}

/** Valeur persistée pour un bloc exercice ; `version` ouvre les migrations. */
export interface StoredBlockAnswers {
  version: 1;
  answers: Record<string, StoredAnswer>;
}

/** Clé localStorage des réponses d'un bloc exercice. */
export function answerStorageKey(courseId: string, blockId: string): string {
  return `oc.student.answers.${courseId}.${blockId}`;
}

/** Valeur vide (aucune réponse enregistrée). */
export function emptyAnswers(): StoredBlockAnswers {
  return { version: 1, answers: {} };
}

/**
 * Lit les réponses persistées d'un bloc. Toute donnée illisible (storage
 * indisponible, JSON corrompu, version inconnue) retombe sur la valeur vide.
 */
export function readAnswers(storage: Storage | null, key: string): StoredBlockAnswers {
  if (storage === null) {
    return emptyAnswers();
  }
  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      return emptyAnswers();
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1 ||
      typeof (parsed as { answers?: unknown }).answers !== 'object'
    ) {
      return emptyAnswers();
    }
    const answers: Record<string, StoredAnswer> = {};
    const rawAnswers = (parsed as { answers: Record<string, unknown> }).answers;
    for (const [id, value] of Object.entries(rawAnswers)) {
      if (typeof value === 'object' && value !== null) {
        const { texte, locked, updatedAt } = value as Partial<StoredAnswer>;
        if (typeof texte === 'string') {
          answers[id] = {
            texte,
            locked: locked === true,
            updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
          };
        }
      }
    }
    return { version: 1, answers };
  } catch {
    return emptyAnswers();
  }
}

/**
 * Persiste les réponses d'un bloc. `false` si l'écriture échoue (quota,
 * storage indisponible) — l'appelant affiche le mode dégradé.
 */
export function writeAnswers(
  storage: Storage | null,
  key: string,
  value: StoredBlockAnswers,
): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Efface les réponses persistées d'un bloc (no-op si storage indisponible). */
export function clearAnswers(storage: Storage | null, key: string): void {
  if (storage === null) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Rien à faire : l'état en mémoire est déjà vidé par l'appelant.
  }
}

/** localStorage s'il est utilisable, sinon `null` (SSR, navigation privée). */
export function answerStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    // Certains navigateurs exposent l'objet mais rejettent toute écriture.
    const probe = 'oc.student.answers.__probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
