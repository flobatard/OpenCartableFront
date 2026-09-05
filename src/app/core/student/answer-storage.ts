/**
 * Persistance locale des réponses d'exercice des élèves — localStorage, sans
 * compte : la copie navigateur des brouillons, indépendante des soumissions
 * au tuteur IA (serveur, élève connecté). Le schéma de clé référence
 * `(courseId, blockId, questionId)` : les `questions[].id` du back sont
 * stables à vie précisément pour ça.
 *
 * Helpers purs + garde d'accès : localStorage peut être indisponible
 * (navigation privée stricte, quota) — toute écriture retourne son succès,
 * l'appelant affiche un mode dégradé (saisie non persistée) au lieu de casser.
 */

/** Réponse d'une question, telle que persistée. */
export interface StoredAnswer {
  text: string;
  /** Marquée « terminée » par l'élève (verrouillée à l'écran). */
  locked: boolean;
  /** ISO 8601 — informatif (non affiché). */
  updatedAt: string;
}

/**
 * Valeur persistée pour un bloc exercice ; `version` ouvre les migrations.
 * v1 (historique) portait le champ `texte` — migré en `text` à la lecture,
 * jamais perdu (cf. `readAnswers`).
 */
export interface StoredBlockAnswers {
  version: 2;
  answers: Record<string, StoredAnswer>;
}

/** Clé localStorage des réponses d'un bloc exercice. */
export function answerStorageKey(courseId: string, blockId: string): string {
  return `oc.student.answers.${courseId}.${blockId}`;
}

/** Valeur vide (aucune réponse enregistrée). */
export function emptyAnswers(): StoredBlockAnswers {
  return { version: 2, answers: {} };
}

/**
 * Lit les réponses persistées d'un bloc. Toute donnée illisible (storage
 * indisponible, JSON corrompu, version inconnue) retombe sur la valeur vide.
 * Une entrée v1 (`{texte, locked, updatedAt}`) est migrée en lecture vers la
 * forme v2 (`{text, …}`) — la prochaine écriture repersiste en v2.
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
      ((parsed as { version?: unknown }).version !== 1 &&
        (parsed as { version?: unknown }).version !== 2) ||
      typeof (parsed as { answers?: unknown }).answers !== 'object'
    ) {
      return emptyAnswers();
    }
    const answers: Record<string, StoredAnswer> = {};
    const rawAnswers = (parsed as { answers: Record<string, unknown> }).answers;
    for (const [id, value] of Object.entries(rawAnswers)) {
      if (typeof value === 'object' && value !== null) {
        const { text, texte, locked, updatedAt } = value as Partial<StoredAnswer> & {
          texte?: unknown;
        };
        // Migration v1→v2 : le champ historique `texte` est relu comme `text`.
        const migrated = typeof text === 'string' ? text : typeof texte === 'string' ? texte : null;
        if (migrated !== null) {
          answers[id] = {
            text: migrated,
            locked: locked === true,
            updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
          };
        }
      }
    }
    return { version: 2, answers };
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
