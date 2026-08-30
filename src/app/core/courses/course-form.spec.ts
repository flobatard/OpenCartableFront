import { buildCourseForm, isCourseFormComplete, payloadFromCourseForm } from './course-form';

describe('course-form', () => {
  it('maps the form to the snake_case payload, trimming the title', () => {
    const form = buildCourseForm();
    form.setValue({
      title: '  Suites numériques  ',
      description: '  Premier chapitre.  ',
      subjectIds: ['math'],
      educationLevelIds: ['college-6e'],
    });

    expect(payloadFromCourseForm(form)).toEqual({
      title: 'Suites numériques',
      description: 'Premier chapitre.',
      subject_ids: ['math'],
      education_level_ids: ['college-6e'],
    });
  });

  it('turns an empty or blank description into null', () => {
    const form = buildCourseForm();
    form.controls.title.setValue('Un cours');
    form.controls.description.setValue('   ');

    expect(payloadFromCourseForm(form).description).toBeNull();
  });

  it('completeness requires a non-blank title', () => {
    const form = buildCourseForm();
    expect(isCourseFormComplete(form.value)).toBe(false);

    form.controls.title.setValue('   ');
    expect(isCourseFormComplete(form.value)).toBe(false);

    form.controls.title.setValue('Un cours');
    expect(isCourseFormComplete(form.value)).toBe(true);
  });

  it('subjects and levels are optional (classification can come later)', () => {
    const form = buildCourseForm();
    form.controls.title.setValue('Un cours');

    expect(isCourseFormComplete(form.value)).toBe(true);
    expect(payloadFromCourseForm(form)).toEqual({
      title: 'Un cours',
      description: null,
      subject_ids: [],
      education_level_ids: [],
    });
  });
});
