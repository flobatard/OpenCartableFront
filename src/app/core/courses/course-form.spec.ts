import { buildCourseForm, isCourseFormComplete, payloadFromCourseForm } from './course-form';

describe('course-form', () => {
  it('mappe le formulaire vers le payload snake_case en trimant le titre', () => {
    const form = buildCourseForm();
    form.setValue({
      titre: '  Suites numériques  ',
      description: '  Premier chapitre.  ',
      subjectIds: ['math'],
      educationLevelIds: ['college-6e'],
    });

    expect(payloadFromCourseForm(form)).toEqual({
      titre: 'Suites numériques',
      description: 'Premier chapitre.',
      subject_ids: ['math'],
      education_level_ids: ['college-6e'],
    });
  });

  it('une description vide ou blanche devient null', () => {
    const form = buildCourseForm();
    form.controls.titre.setValue('Un cours');
    form.controls.description.setValue('   ');

    expect(payloadFromCourseForm(form).description).toBeNull();
  });

  it('la complétude exige un titre non blanc', () => {
    const form = buildCourseForm();
    expect(isCourseFormComplete(form.value)).toBe(false);

    form.controls.titre.setValue('   ');
    expect(isCourseFormComplete(form.value)).toBe(false);

    form.controls.titre.setValue('Un cours');
    expect(isCourseFormComplete(form.value)).toBe(true);
  });

  it('matières et niveaux sont optionnels (classement possible après coup)', () => {
    const form = buildCourseForm();
    form.controls.titre.setValue('Un cours');

    expect(isCourseFormComplete(form.value)).toBe(true);
    expect(payloadFromCourseForm(form)).toEqual({
      titre: 'Un cours',
      description: null,
      subject_ids: [],
      education_level_ids: [],
    });
  });
});
