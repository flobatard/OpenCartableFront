/**
 * Types du tuteur IA de résolution d'exercice (côté élève) — le fil par
 * question et son contrat API (`/v1/student/courses/{id}/blocks/{id}/…`,
 * JWT de l'élève requis : le régime anonyme n'a pas d'IA).
 *
 * Un fil = les **tours** persistés de l'élève sur UNE question (réponse
 * soumise ou message d'aide, chacun avec le retour du tuteur), plus l'état
 * vivant du tour en cours (`live`), la dernière erreur et le corrigé du
 * professeur s'il a été révélé — révélation décidée par le BACK sur le
 * verdict structuré du modèle, jamais par le front.
 */

export type SubmissionKind = 'answer' | 'message';
export type SubmissionVerdict = 'correct' | 'partial' | 'incorrect' | 'none';
export type SubmissionEffort = 'sufficient' | 'insufficient';

/** Un tour persisté (forme des lignes serveur). */
export interface SubmissionTurn {
  id: string;
  kind: SubmissionKind;
  content: string;
  /** Retour du tuteur en markdown de cours ; `null` = jamais produit (échec). */
  feedback: string | null;
  verdict: SubmissionVerdict | null;
  effort: SubmissionEffort | null;
  revealed: boolean;
  created_at: string;
}

/** Tour en cours : le texte du tuteur arrive token par token (vide = en attente). */
export interface LiveTurn {
  kind: SubmissionKind;
  content: string;
  text: string;
}

export interface QuestionThread {
  turns: SubmissionTurn[];
  live: LiveTurn | null;
  /** Statut HTTP de la dernière erreur (0 = réseau), `null` sinon. */
  error: number | null;
  /** Corrigé du professeur, présent ssi un tour l'a révélé. */
  revealedAnswer: string | null;
}

/** Demande émise par la vue (`correctionRequested`) : réponse ou message libre. */
export interface CorrectionRequest {
  blockId: string;
  questionId: string;
  kind: SubmissionKind;
  content: string;
}

/** Effacement demandé par la vue (`threadsClearRequested`) : une question, ou tout le bloc. */
export interface ThreadsClearRequest {
  blockId: string;
  /** `null` = tous les fils du bloc. */
  questionId: string | null;
}

/** Réponse de `GET …/submissions`. */
export interface SubmissionsRead {
  questions: Record<string, { turns: SubmissionTurn[]; revealed_answer: string | null }>;
}

/** Événements SSE du flux du tuteur (contrat additif — mêmes noms que l'assistant). */
export type TutorStreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | {
      type: 'tool_result';
      id: string;
      name: string;
      is_error: boolean;
      excerpt: string;
      length: number;
    }
  | {
      type: 'done';
      submission_id: string;
      verdict: SubmissionVerdict;
      effort: SubmissionEffort | null;
      revealed: boolean;
      expected_answer: string | null;
      usage: unknown;
    }
  | { type: 'error'; status: number; detail: string };

export const TUTOR_EVENTS: ReadonlySet<string> = new Set<TutorStreamEvent['type']>([
  'token',
  'thinking',
  'tool_call',
  'tool_result',
  'done',
  'error',
]);

export function emptyThread(): QuestionThread {
  return { turns: [], live: null, error: null, revealedAnswer: null };
}
