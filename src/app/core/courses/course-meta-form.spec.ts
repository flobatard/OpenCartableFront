import {
  buildCourseMetaForm,
  isCourseMetaFormComplete,
  patchCourseMetaForm,
  payloadFromCourseMetaForm,
} from './course-meta-form';

describe('course-meta-form', () => {
  it('maps the form to the update payload, trimming title and description', () => {
    const form = buildCourseMetaForm();
    form.setValue({
      title: '  Suites et limites  ',
      description: '  Chapitre 2.  ',
      subjectIds: ['math'],
      educationLevelIds: ['college-6e'],
    });

    expect(payloadFromCourseMetaForm(form)).toEqual({
      title: 'Suites et limites',
      description: 'Chapitre 2.',
      subject_ids: ['math'],
      education_level_ids: ['college-6e'],
    });
  });

  it('turns a blank description into null and sends empty lists as-is (clearing)', () => {
    const form = buildCourseMetaForm();
    form.setValue({ title: 'Un titre', description: '   ', subjectIds: [], educationLevelIds: [] });

    expect(payloadFromCourseMetaForm(form)).toEqual({
      title: 'Un titre',
      description: null,
      subject_ids: [],
      education_level_ids: [],
    });
  });

  it('patchCourseMetaForm prefills from a course (null description becomes empty string)', () => {
    const form = buildCourseMetaForm();

    patchCourseMetaForm(form, {
      title: 'Suites numériques',
      description: null,
      subject_ids: ['math'],
      education_level_ids: [],
    });
    expect(form.getRawValue()).toEqual({
      title: 'Suites numériques',
      description: '',
      subjectIds: ['math'],
      educationLevelIds: [],
    });
    expect(payloadFromCourseMetaForm(form)).toEqual({
      title: 'Suites numériques',
      description: null,
      subject_ids: ['math'],
      education_level_ids: [],
    });
  });

  it('is complete only with a non-blank title (same rule as the back)', () => {
    const form = buildCourseMetaForm();
    const lists = { subjectIds: [], educationLevelIds: [] };

    form.setValue({ title: '   ', description: 'Peu importe', ...lists });
    expect(isCourseMetaFormComplete(form.value)).toBe(false);

    form.setValue({ title: 'Un titre', description: '', ...lists });
    expect(isCourseMetaFormComplete(form.value)).toBe(true);
  });
});
