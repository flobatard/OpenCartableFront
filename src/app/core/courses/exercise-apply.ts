import { AssistantExerciseProposal } from '../course-assistant/proposals';
import { ExerciseContentPayload, ExerciseQuestionPayload } from './course.model';
import { QUESTIONS_MAX } from './exercise-form';

/**
 * Application HEADLESS d'une proposition d'exercice (édition globale : la
 * cible n'est pas ouverte dans un éditeur) — helper PUR, miroir des
 * opérations de `ExerciseEditor.apply*` sur un payload plutôt qu'un
 * formulaire : le résultat est le `content` à envoyer au PATCH du bloc.
 *
 * `null` = rien à appliquer (question visée disparue, plafond de questions
 * atteint) : l'hôte le rend comme une cible introuvable. Une question ajoutée
 * part sans id (`id: null`) : le back génère un id stable à vie.
 */
export function applyExerciseProposal(
  current: ExerciseContentPayload,
  proposal: AssistantExerciseProposal,
): ExerciseContentPayload | null {
  switch (proposal.kind) {
    case 'exercise_statement':
      return { ...current, statement: proposal.statement };
    case 'exercise_question_edit': {
      const index = questionIndex(current, proposal.questionId);
      if (index < 0) {
        return null;
      }
      const questions = current.questions.map((question, i) =>
        i === index
          ? {
              ...question,
              statement: proposal.statement ?? question.statement,
              expected_answer: proposal.expectedAnswer ?? question.expected_answer,
            }
          : question,
      );
      return { ...current, questions };
    }
    case 'exercise_question_add': {
      if (current.questions.length >= QUESTIONS_MAX) {
        return null;
      }
      const anchor = proposal.afterId === null ? -1 : questionIndex(current, proposal.afterId);
      const at = anchor < 0 ? current.questions.length : anchor + 1;
      const question: ExerciseQuestionPayload = {
        id: null,
        statement: proposal.statement,
        type: 'free_text',
        expected_answer: proposal.expectedAnswer,
      };
      return {
        ...current,
        questions: [...current.questions.slice(0, at), question, ...current.questions.slice(at)],
      };
    }
    case 'exercise_question_delete': {
      const index = questionIndex(current, proposal.questionId);
      if (index < 0) {
        return null;
      }
      return { ...current, questions: current.questions.filter((_, i) => i !== index) };
    }
  }
}

function questionIndex(content: ExerciseContentPayload, id: string): number {
  return content.questions.findIndex((question) => question.id === id);
}
