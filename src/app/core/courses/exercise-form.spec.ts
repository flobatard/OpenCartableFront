import {
  addQuestion,
  applyGeneratedIds,
  buildExerciseForm,
  moveQuestion,
  patchExerciseFormFromContent,
  payloadFromBlockContent,
  payloadFromExerciseForm,
  removeQuestion,
} from './exercise-form';

const CONTENT = {
  enonce: '## Suites\nSoit $u_n$ une suite.',
  questions: [
    { id: 'q-1', enonce: 'Montrer que $u_n$ converge.', type: 'texte_libre', reponse_attendue: 'Par encadrement.' },
    { id: 'q-2', enonce: 'Donner sa limite.', type: 'texte_libre', reponse_attendue: '0' },
  ],
};

describe('exercise-form', () => {
  it('patchExerciseFormFromContent pré-remplit sujet et questions sans émettre', () => {
    const form = buildExerciseForm();
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    patchExerciseFormFromContent(form, CONTENT);

    expect(emissions).toEqual([]);
    expect(form.getRawValue()).toEqual({
      enonce: '## Suites\nSoit $u_n$ une suite.',
      questions: [
        { id: 'q-1', enonce: 'Montrer que $u_n$ converge.', reponseAttendue: 'Par encadrement.' },
        { id: 'q-2', enonce: 'Donner sa limite.', reponseAttendue: '0' },
      ],
    });
  });

  it('patchExerciseFormFromContent mute la FormArray existante (les souscriptions survivent)', () => {
    const form = buildExerciseForm();
    const questionsAvant = form.controls.questions;

    patchExerciseFormFromContent(form, CONTENT);

    expect(form.controls.questions).toBe(questionsAvant);
    // La souscription posée avant le patch voit bien les frappes suivantes.
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));
    form.controls.questions.at(0).controls.enonce.setValue('Modifiée');
    expect(emissions.length).toBe(1);
  });

  it('tolère le contenu par défaut, le legacy sans reponse_attendue et le malformé', () => {
    const form = buildExerciseForm();

    patchExerciseFormFromContent(form, { enonce: '', questions: [] });
    expect(form.getRawValue()).toEqual({ enonce: '', questions: [] });

    patchExerciseFormFromContent(form, {
      enonce: 'Sujet',
      questions: [{ id: 'q-1', enonce: 'Q1', type: 'texte_libre' }],
    });
    expect(form.getRawValue().questions).toEqual([
      { id: 'q-1', enonce: 'Q1', reponseAttendue: '' },
    ]);

    patchExerciseFormFromContent(form, { enonce: 42, questions: 'oops' });
    expect(form.getRawValue()).toEqual({ enonce: '', questions: [] });
  });

  it('payloadFromExerciseForm mappe vers le contrat back (snake_case, type posé, id null)', () => {
    const form = buildExerciseForm();
    patchExerciseFormFromContent(form, CONTENT);
    addQuestion(form);
    form.controls.questions.at(2).controls.enonce.setValue('Nouvelle question');

    expect(payloadFromExerciseForm(form)).toEqual({
      enonce: '## Suites\nSoit $u_n$ une suite.',
      questions: [
        { id: 'q-1', enonce: 'Montrer que $u_n$ converge.', type: 'texte_libre', reponse_attendue: 'Par encadrement.' },
        { id: 'q-2', enonce: 'Donner sa limite.', type: 'texte_libre', reponse_attendue: '0' },
        { id: null, enonce: 'Nouvelle question', type: 'texte_libre', reponse_attendue: '' },
      ],
    });
  });

  it('payloadFromBlockContent normalise un content back en payload comparable', () => {
    expect(payloadFromBlockContent(CONTENT)).toEqual(CONTENT);
    expect(payloadFromBlockContent({})).toEqual({ enonce: '', questions: [] });
  });

  it('addQuestion et removeQuestion émettent (autosave déclenché)', () => {
    const form = buildExerciseForm();
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    addQuestion(form);
    expect(emissions.length).toBe(1);
    removeQuestion(form, 0);
    expect(emissions.length).toBe(2);
    expect(form.controls.questions.length).toBe(0);
  });

  it('moveQuestion déplace en émettant une seule fois, no-op aux bornes', () => {
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

  it('applyGeneratedIds pose les ids null sans émettre et sans écraser', () => {
    const form = buildExerciseForm();
    patchExerciseFormFromContent(form, { enonce: 'Sujet', questions: [] });
    addQuestion(form);
    addQuestion(form);
    form.controls.questions.at(0).controls.id.setValue('deja-la', { emitEvent: false });
    const emissions: unknown[] = [];
    form.valueChanges.subscribe((v) => emissions.push(v));

    applyGeneratedIds([...form.controls.questions.controls], {
      enonce: 'Sujet',
      questions: [
        { id: 'autre', enonce: '', type: 'texte_libre', reponse_attendue: '' },
        { id: 'q-new', enonce: '', type: 'texte_libre', reponse_attendue: '' },
        { id: 'disparu', enonce: '', type: 'texte_libre', reponse_attendue: '' },
      ],
    });

    expect(emissions).toEqual([]);
    expect(form.controls.questions.at(0).controls.id.value).toBe('deja-la'); // jamais écrasé
    expect(form.controls.questions.at(1).controls.id.value).toBe('q-new');
  });

  it('applyGeneratedIds matche sur le snapshot capturé à l’envoi, pas sur la FormArray courante', () => {
    // Une question supprimée pendant le vol du PATCH ne décale pas les ids
    // des groupes restants : le matching suit les instances envoyées.
    const form = buildExerciseForm();
    addQuestion(form);
    addQuestion(form);
    const snapshot = [...form.controls.questions.controls];
    const survivant = form.controls.questions.at(1);

    removeQuestion(form, 0); // supprimée pendant le vol

    applyGeneratedIds(snapshot, {
      enonce: '',
      questions: [
        { id: 'id-supprimee', enonce: '', type: 'texte_libre', reponse_attendue: '' },
        { id: 'id-survivant', enonce: '', type: 'texte_libre', reponse_attendue: '' },
      ],
    });

    expect(survivant.controls.id.value).toBe('id-survivant');
  });
});
