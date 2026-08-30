import {
  addQuestion,
  applyGeneratedIds,
  buildExerciseForm,
  exerciseMarkdownFromContent,
  fullExerciseMarkdown,
  moveQuestion,
  moveQuestionTo,
  patchExerciseFormFromContent,
  payloadFromBlockContent,
  payloadFromExerciseForm,
  questionStatementPreview,
  removeQuestion,
} from './exercise-form';

const CONTENT = {
  statement: '## Suites\nSoit $u_n$ une suite.',
  questions: [
    {
      id: 'q-1',
      statement: 'Montrer que $u_n$ converge.',
      type: 'free_text',
      expected_answer: 'Par encadrement.',
    },
    { id: 'q-2', statement: 'Donner sa limite.', type: 'free_text', expected_answer: '0' },
  ],
};

describe('exercise-form', () => {
  it('patchExerciseFormFromContent prefills statement and questions without emitting', () => {
    const form = buildExerciseForm();
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    patchExerciseFormFromContent(form, CONTENT);

    expect(emissions).toEqual([]);
    expect(form.getRawValue()).toEqual({
      statement: '## Suites\nSoit $u_n$ une suite.',
      questions: [
        { id: 'q-1', statement: 'Montrer que $u_n$ converge.', expectedAnswer: 'Par encadrement.' },
        { id: 'q-2', statement: 'Donner sa limite.', expectedAnswer: '0' },
      ],
    });
  });

  it('patchExerciseFormFromContent mutates the existing FormArray (subscriptions survive)', () => {
    const form = buildExerciseForm();
    const questionsBefore = form.controls.questions;

    patchExerciseFormFromContent(form, CONTENT);

    expect(form.controls.questions).toBe(questionsBefore);
    // La souscription posée avant le patch voit bien les frappes suivantes.
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));
    form.controls.questions.at(0).controls.statement.setValue('Modifiée');
    expect(emissions.length).toBe(1);
  });

  it('tolerates default content, legacy without expected_answer, and malformed content', () => {
    const form = buildExerciseForm();

    patchExerciseFormFromContent(form, { statement: '', questions: [] });
    expect(form.getRawValue()).toEqual({ statement: '', questions: [] });

    patchExerciseFormFromContent(form, {
      statement: 'Sujet',
      questions: [{ id: 'q-1', statement: 'Q1', type: 'free_text' }],
    });
    expect(form.getRawValue().questions).toEqual([
      { id: 'q-1', statement: 'Q1', expectedAnswer: '' },
    ]);

    patchExerciseFormFromContent(form, { statement: 42, questions: 'oops' });
    expect(form.getRawValue()).toEqual({ statement: '', questions: [] });
  });

  it('payloadFromExerciseForm maps to the backend contract (snake_case, type set, null id)', () => {
    const form = buildExerciseForm();
    patchExerciseFormFromContent(form, CONTENT);
    addQuestion(form);
    form.controls.questions.at(2).controls.statement.setValue('Nouvelle question');

    expect(payloadFromExerciseForm(form)).toEqual({
      statement: '## Suites\nSoit $u_n$ une suite.',
      questions: [
        {
          id: 'q-1',
          statement: 'Montrer que $u_n$ converge.',
          type: 'free_text',
          expected_answer: 'Par encadrement.',
        },
        { id: 'q-2', statement: 'Donner sa limite.', type: 'free_text', expected_answer: '0' },
        { id: null, statement: 'Nouvelle question', type: 'free_text', expected_answer: '' },
      ],
    });
  });

  it('payloadFromBlockContent normalizes a backend content into a comparable payload', () => {
    expect(payloadFromBlockContent(CONTENT)).toEqual(CONTENT);
    expect(payloadFromBlockContent({})).toEqual({ statement: '', questions: [] });
  });

  it('addQuestion and removeQuestion emit (autosave triggered)', () => {
    const form = buildExerciseForm();
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    addQuestion(form);
    expect(emissions.length).toBe(1);
    removeQuestion(form, 0);
    expect(emissions.length).toBe(2);
    expect(form.controls.questions.length).toBe(0);
  });

  it('moveQuestion moves with a single emission, no-op at the bounds', () => {
    const form = buildExerciseForm();
    patchExerciseFormFromContent(form, CONTENT);
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    moveQuestion(form, 0, 1);
    expect(emissions.length).toBe(1);
    expect(payloadFromExerciseForm(form).questions.map((q) => q.id)).toEqual(['q-2', 'q-1']);

    moveQuestion(form, 1, 1); // borne basse
    moveQuestion(form, 0, -1); // borne haute
    expect(emissions.length).toBe(1);
    expect(payloadFromExerciseForm(form).questions.map((q) => q.id)).toEqual(['q-2', 'q-1']);
  });

  it('moveQuestionTo moves to an arbitrary index reusing the instance, single emission', () => {
    const form = buildExerciseForm();
    patchExerciseFormFromContent(form, CONTENT);
    addQuestion(form); // 3 questions : q-1, q-2, (id null)
    const first = form.controls.questions.at(0);
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    moveQuestionTo(form, 0, 2);

    expect(emissions.length).toBe(1);
    expect(payloadFromExerciseForm(form).questions.map((q) => q.id)).toEqual(['q-2', null, 'q-1']);
    // Instance réutilisée : le même FormGroup est désormais en dernière position
    // (contrat pour @for track group, openGroup et applyGeneratedIds).
    expect(form.controls.questions.at(2)).toBe(first);
  });

  it('moveQuestionTo is a no-op at the bounds and for from === to', () => {
    const form = buildExerciseForm();
    patchExerciseFormFromContent(form, CONTENT); // 2 questions
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    moveQuestionTo(form, 0, 0); // égal
    moveQuestionTo(form, -1, 1); // from hors bornes
    moveQuestionTo(form, 0, 2); // to hors bornes

    expect(emissions.length).toBe(0);
    expect(payloadFromExerciseForm(form).questions.map((q) => q.id)).toEqual(['q-1', 'q-2']);
  });

  it('applyGeneratedIds sets null ids without emitting and without overwriting', () => {
    const form = buildExerciseForm();
    patchExerciseFormFromContent(form, { statement: 'Sujet', questions: [] });
    addQuestion(form);
    addQuestion(form);
    form.controls.questions.at(0).controls.id.setValue('deja-la', { emitEvent: false });
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    applyGeneratedIds([...form.controls.questions.controls], {
      statement: 'Sujet',
      questions: [
        { id: 'autre', statement: '', type: 'free_text', expected_answer: '' },
        { id: 'q-new', statement: '', type: 'free_text', expected_answer: '' },
        { id: 'disparu', statement: '', type: 'free_text', expected_answer: '' },
      ],
    });

    expect(emissions).toEqual([]);
    expect(form.controls.questions.at(0).controls.id.value).toBe('deja-la'); // jamais écrasé
    expect(form.controls.questions.at(1).controls.id.value).toBe('q-new');
  });

  it('applyGeneratedIds matches on the snapshot captured at send time, not the current FormArray', () => {
    // Une question supprimée pendant le vol du PATCH ne décale pas les ids
    // des groupes restants : le matching suit les instances envoyées.
    const form = buildExerciseForm();
    addQuestion(form);
    addQuestion(form);
    const snapshot = [...form.controls.questions.controls];
    const survivor = form.controls.questions.at(1);

    removeQuestion(form, 0); // supprimée pendant le vol

    applyGeneratedIds(snapshot, {
      statement: '',
      questions: [
        { id: 'id-supprimee', statement: '', type: 'free_text', expected_answer: '' },
        { id: 'id-survivant', statement: '', type: 'free_text', expected_answer: '' },
      ],
    });

    expect(survivor.controls.id.value).toBe('id-survivant');
  });

  it('fullExerciseMarkdown joins statement + question statements, skips blanks, separates with \\n\\n', () => {
    const form = buildExerciseForm();
    // Formulaire entièrement vide → chaîne vide.
    expect(fullExerciseMarkdown(form)).toBe('');

    patchExerciseFormFromContent(form, CONTENT);
    expect(fullExerciseMarkdown(form)).toBe(
      '## Suites\nSoit $u_n$ une suite.\n\nMontrer que $u_n$ converge.\n\nDonner sa limite.',
    );

    // Sujet seul (aucune question).
    const statementOnly = buildExerciseForm();
    statementOnly.controls.statement.setValue('Un énoncé.');
    expect(fullExerciseMarkdown(statementOnly)).toBe('Un énoncé.');

    // Blocs vides ou en espaces ignorés, pas de séparateur superflu.
    patchExerciseFormFromContent(form, {
      statement: '   ',
      questions: [
        { id: null, statement: 'Q1', type: 'free_text', expected_answer: '' },
        { id: null, statement: '  ', type: 'free_text', expected_answer: '' },
        { id: null, statement: 'Q3', type: 'free_text', expected_answer: '' },
      ],
    });
    expect(fullExerciseMarkdown(form)).toBe('Q1\n\nQ3');
  });

  it('exerciseMarkdownFromContent joins statement + question statements without expected answers', () => {
    // Même sortie que fullExerciseMarkdown, mais depuis un content brut.
    expect(exerciseMarkdownFromContent(CONTENT)).toBe(
      '## Suites\nSoit $u_n$ une suite.\n\nMontrer que $u_n$ converge.\n\nDonner sa limite.',
    );
    // Les réponses attendues n'apparaissent jamais.
    expect(exerciseMarkdownFromContent(CONTENT)).not.toContain('Par encadrement.');
    // Content vide / malformé toléré → chaîne vide.
    expect(exerciseMarkdownFromContent({})).toBe('');
    expect(exerciseMarkdownFromContent({ statement: 5, questions: 'nope' })).toBe('');
    // Vides ignorés, pas de séparateur superflu.
    expect(
      exerciseMarkdownFromContent({
        statement: '   ',
        questions: [
          { id: null, statement: 'Q1', type: 'free_text', expected_answer: '' },
          { id: null, statement: '  ', type: 'free_text', expected_answer: '' },
          { id: null, statement: 'Q3', type: 'free_text', expected_answer: '' },
        ],
      }),
    ).toBe('Q1\n\nQ3');
  });

  it('questionStatementPreview normalizes whitespace and truncates', () => {
    expect(questionStatementPreview('')).toBe('');
    expect(questionStatementPreview('   ')).toBe('');
    // Markdown multi-lignes → une seule ligne, espaces normalisés.
    expect(questionStatementPreview('## Titre\n\nSoit  $x$   pair.')).toBe(
      '## Titre Soit $x$ pair.',
    );
    // Troncature avec ellipsis au-delà de la longueur max.
    const long = 'a'.repeat(100);
    const preview = questionStatementPreview(long, 80);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBe(81);
  });
});
