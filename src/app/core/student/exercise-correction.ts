/**
 * Correction IA d'une réponse d'élève (J5, à brancher) — types seuls. Le
 * front réserve dès maintenant l'emplacement par question dans `ExerciseView`
 * (`shared/course-blocks-view/`) : une entrée dans la map `corrections` par
 * id de question, **aucune entrée = rien de rendu**. L'appel lui-même relève
 * du régime élève anonyme (reporté — cf. TODO.md : imputation du quota d'un
 * élève sans compte) et restera **sans persistance** (décision produit) :
 * rien ici ne touche `answer-storage.ts`.
 */

/** État de la correction d'une question ; absente de la map = jamais demandée. */
export type QuestionCorrection =
  | { status: 'pending' }
  /** Retour du modèle, en markdown de cours (rendu par `app-markdown-view`). */
  | { status: 'done'; feedback: string }
  /** Échec : libellé générique côté vue, le bouton de demande sert de retry. */
  | { status: 'error' };

/** Demande émise par la vue (`correctionRequested`) : la réponse courante d'une question. */
export interface CorrectionRequest {
  blockId: string;
  questionId: string;
  answer: string;
}
