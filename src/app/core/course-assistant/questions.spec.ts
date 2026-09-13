import { AssistantMessage } from './assistant.model';
import {
  AssistantQuestion,
  draftAnswer,
  emptyDraft,
  isDraftAnswered,
  parseQuestions,
  pendingQuestionsFromHistory,
  questionsReplyBody,
  selectOption,
  setOtherChecked,
  typeOther,
} from './questions';

const ARGS = {
  questions: [
    {
      question: '  Quel   niveau visez-vous ? ',
      multi_select: false,
      options: [{ label: 'Seconde' }, { label: 'Première', description: 'Spécialité maths' }],
    },
    {
      question: 'Quelles notions inclure ?',
      multi_select: true,
      options: [{ label: 'Dérivée' }, { label: 'Limites' }, { label: 'Suites', description: ' ' }],
    },
  ],
};

const SINGLE: AssistantQuestion = {
  text: 'Quel niveau visez-vous ?',
  multiSelect: false,
  options: [
    { label: 'Seconde', description: null },
    { label: 'Première', description: 'Spécialité maths' },
  ],
};

const MULTI: AssistantQuestion = {
  text: 'Quelles notions inclure ?',
  multiSelect: true,
  options: [
    { label: 'Dérivée', description: null },
    { label: 'Limites', description: null },
    { label: 'Suites', description: null },
  ],
};

let messageSequence = 0;

function message(
  partial: Partial<AssistantMessage> & Pick<AssistantMessage, 'role'>,
): AssistantMessage {
  return {
    id: `m-${(messageSequence += 1)}`,
    position: 0,
    content: '',
    tool_calls: [],
    tool_call_id: null,
    is_error: false,
    sources: {},
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    created_at: '2026-09-13T10:00:00Z',
    ...partial,
  };
}

describe('parseQuestions', () => {
  it('types the questions in the order of the args (whitespace collapsed)', () => {
    expect(parseQuestions({ id: 'call_q', name: 'ask_questions', args: ARGS })).toEqual([
      SINGLE,
      MULTI,
    ]);
  });

  it('treats a missing multi_select as a single choice', () => {
    const args = { questions: [{ question: 'Q ?', options: [{ label: 'A' }, { label: 'B' }] }] };
    expect(parseQuestions({ id: 'c', name: 'ask_questions', args })?.[0].multiSelect).toBe(false);
  });

  it('returns null for another tool or malformed args', () => {
    expect(parseQuestions({ id: 'c', name: 'read_block', args: ARGS })).toBeNull();
    for (const args of [
      {},
      { questions: [] },
      { questions: ['Niveau ?'] },
      { questions: [{ question: ' ', options: [{ label: 'A' }] }] },
      { questions: [{ question: 'Q ?', multi_select: 'oui', options: [{ label: 'A' }] }] },
      { questions: [{ question: 'Q ?', options: [] }] },
      { questions: [{ question: 'Q ?', options: ['A', 'B'] }] },
      { questions: [{ question: 'Q ?', options: [{ label: '' }] }] },
    ]) {
      expect(parseQuestions({ id: 'c', name: 'ask_questions', args })).toBeNull();
    }
  });
});

describe('pendingQuestionsFromHistory', () => {
  const askCall = { id: 'call_q', name: 'ask_questions', arguments: ARGS };

  it('finds the unanswered questions ending a reloaded conversation', () => {
    const messages = [
      message({ role: 'user', content: 'Crée un exercice' }),
      message({ role: 'assistant', tool_calls: [askCall] }),
    ];
    expect(pendingQuestionsFromHistory(messages)).toEqual({
      id: 'call_q',
      questions: [SINGLE, MULTI],
    });
  });

  it('ignores answered reads of the same round and calls rejected by the guard', () => {
    const messages = [
      message({ role: 'user' }),
      message({
        role: 'assistant',
        tool_calls: [
          { id: 'call_r', name: 'read_block', arguments: { block_ref: 'B1' } },
          askCall,
          { id: 'call_dup', name: 'ask_questions', arguments: ARGS },
        ],
      }),
      message({ role: 'tool', tool_call_id: 'call_r', content: 'CONTENU' }),
      message({ role: 'tool', tool_call_id: 'call_dup', content: 'Appel ignoré', is_error: true }),
    ];
    expect(pendingQuestionsFromHistory(messages)?.id).toBe('call_q');
  });

  it('returns null once answered, when the conversation went on, or without questions', () => {
    const asked = message({ role: 'assistant', tool_calls: [askCall] });
    const answer = message({ role: 'tool', tool_call_id: 'call_q', content: 'Réponses…' });
    expect(pendingQuestionsFromHistory([message({ role: 'user' }), asked, answer])).toBeNull();
    expect(
      pendingQuestionsFromHistory([asked, message({ role: 'user', content: 'Autre chose' })]),
    ).toBeNull();
    expect(pendingQuestionsFromHistory([message({ role: 'assistant', content: 'Voici' })])).toBe(
      null,
    );
    expect(pendingQuestionsFromHistory([])).toBeNull();
  });
});

describe('question drafts', () => {
  it('a single choice replaces the answer, including a checked « Autre »', () => {
    let draft = typeOther(emptyDraft(), SINGLE, 'Terminale');
    expect(draft).toEqual({ selected: [], otherChecked: true, otherText: 'Terminale' });
    draft = selectOption(draft, SINGLE, 1);
    expect(draft).toEqual({ selected: [1], otherChecked: false, otherText: 'Terminale' });
    draft = setOtherChecked(draft, SINGLE, true);
    expect(draft).toEqual({ selected: [], otherChecked: true, otherText: 'Terminale' });
  });

  it('a multiple choice toggles options (kept in option order) next to « Autre »', () => {
    let draft = selectOption(emptyDraft(), MULTI, 2);
    draft = selectOption(draft, MULTI, 0);
    draft = typeOther(draft, MULTI, 'Tangentes');
    expect(draft).toEqual({ selected: [0, 2], otherChecked: true, otherText: 'Tangentes' });
    draft = selectOption(draft, MULTI, 2);
    expect(draft.selected).toEqual([0]);
  });

  it('typing an empty text does not check « Autre »', () => {
    expect(typeOther(emptyDraft(), MULTI, '   ').otherChecked).toBe(false);
  });

  it('is answered by an option or a non-blank « Autre », never by a blank checked « Autre »', () => {
    expect(isDraftAnswered(emptyDraft())).toBe(false);
    expect(isDraftAnswered({ selected: [1], otherChecked: false, otherText: '' })).toBe(true);
    expect(isDraftAnswered({ selected: [], otherChecked: true, otherText: 'Terminale' })).toBe(
      true,
    );
    expect(isDraftAnswered({ selected: [1], otherChecked: true, otherText: '  ' })).toBe(false);
  });

  it('builds the answer: trimmed « Autre » only when checked', () => {
    expect(draftAnswer({ selected: [0, 2], otherChecked: true, otherText: ' Tangentes ' })).toEqual(
      { selected: [0, 2], other: 'Tangentes' },
    );
    expect(draftAnswer({ selected: [1], otherChecked: false, otherText: 'oublié' })).toEqual({
      selected: [1],
      other: null,
    });
  });

  it('builds the reply body of the answer route', () => {
    expect(questionsReplyBody({ declined: true })).toEqual({ declined: true, answers: null });
    const answers = [{ selected: [1], other: null }];
    expect(questionsReplyBody({ declined: false, answers })).toEqual({ declined: false, answers });
  });
});
