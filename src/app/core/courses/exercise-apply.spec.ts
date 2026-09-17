import { ExerciseContentPayload } from './course.model';
import { applyExerciseProposal } from './exercise-apply';
import { QUESTIONS_MAX } from './exercise-form';

const CURRENT: ExerciseContentPayload = {
  statement: 'Soit $x$.',
  questions: [
    { id: 'q1', statement: 'Calculer.', type: 'free_text', expected_answer: '4' },
    { id: 'q2', statement: 'Conclure.', type: 'free_text', expected_answer: '' },
  ],
};

describe('applyExerciseProposal', () => {
  it('replaces the statement', () => {
    const next = applyExerciseProposal(CURRENT, {
      kind: 'exercise_statement',
      id: 'c',
      summary: null,
      statement: 'Soit $y$.',
    });
    expect(next?.statement).toBe('Soit $y$.');
    expect(next?.questions).toEqual(CURRENT.questions);
  });

  it('edits a question, keeping the fields the proposal leaves null', () => {
    const next = applyExerciseProposal(CURRENT, {
      kind: 'exercise_question_edit',
      id: 'c',
      summary: null,
      questionId: 'q2',
      statement: null,
      expectedAnswer: '42',
    });
    expect(next?.questions[1]).toEqual({
      id: 'q2',
      statement: 'Conclure.',
      type: 'free_text',
      expected_answer: '42',
    });
    expect(
      applyExerciseProposal(CURRENT, {
        kind: 'exercise_question_edit',
        id: 'c',
        summary: null,
        questionId: 'gone',
        statement: 'x',
        expectedAnswer: null,
      }),
    ).toBeNull();
  });

  it('adds a question after the anchor (end when null or unknown), without id', () => {
    const added = {
      kind: 'exercise_question_add' as const,
      id: 'c',
      summary: null,
      statement: 'Nouvelle.',
      expectedAnswer: 'r',
      afterId: 'q1',
    };
    expect(applyExerciseProposal(CURRENT, added)?.questions.map((q) => q.id)).toEqual([
      'q1',
      null,
      'q2',
    ]);
    expect(
      applyExerciseProposal(CURRENT, { ...added, afterId: null })?.questions.map((q) => q.id),
    ).toEqual(['q1', 'q2', null]);
    expect(
      applyExerciseProposal(CURRENT, { ...added, afterId: 'gone' })?.questions.map((q) => q.id),
    ).toEqual(['q1', 'q2', null]);
    const inserted = applyExerciseProposal(CURRENT, added)!.questions[1];
    expect(inserted).toEqual({
      id: null,
      statement: 'Nouvelle.',
      type: 'free_text',
      expected_answer: 'r',
    });
  });

  it('refuses an addition beyond the question cap', () => {
    const full: ExerciseContentPayload = {
      statement: '',
      questions: Array.from({ length: QUESTIONS_MAX }, (_, i) => ({
        id: `q${i}`,
        statement: 's',
        type: 'free_text' as const,
        expected_answer: '',
      })),
    };
    expect(
      applyExerciseProposal(full, {
        kind: 'exercise_question_add',
        id: 'c',
        summary: null,
        statement: 'x',
        expectedAnswer: '',
        afterId: null,
      }),
    ).toBeNull();
  });

  it('deletes a question; a vanished target yields null', () => {
    expect(
      applyExerciseProposal(CURRENT, {
        kind: 'exercise_question_delete',
        id: 'c',
        summary: null,
        questionId: 'q1',
      })?.questions.map((q) => q.id),
    ).toEqual(['q2']);
    expect(
      applyExerciseProposal(CURRENT, {
        kind: 'exercise_question_delete',
        id: 'c',
        summary: null,
        questionId: 'gone',
      }),
    ).toBeNull();
  });
});
