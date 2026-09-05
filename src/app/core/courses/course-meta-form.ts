import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CourseUpdatePayload } from './course.model';

/**
 * Formulaire d'édition d'un cours existant — titre, description, classement
 * matières/niveaux : helpers purs, sur le modèle de `course-form.ts` (formulaire
 * de création, dont il partage les contrôles et les bornes). Sert la modale
 * `CourseEditDialog` ; le payload est toujours complet (les quatre clés), le
 * PATCH partiel du back n'étant utilisé que par ce qu'on choisit d'envoyer.
 */

/** Longueurs miroir du back (`title` ≤ 300, `description` ≤ 2000). */
const TITLE_MAX = 300;
const DESCRIPTION_MAX = 2000;

export function buildCourseMetaForm() {
  return new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(TITLE_MAX)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(DESCRIPTION_MAX)],
    }),
    subjectIds: new FormControl<string[]>([], { nonNullable: true }),
    educationLevelIds: new FormControl<string[]>([], { nonNullable: true }),
  });
}

export type CourseMetaForm = ReturnType<typeof buildCourseMetaForm>;

/**
 * Corps du `PATCH /courses/{id}` : titre trimé, description vide → `null`,
 * classement en remplacement (listes toujours envoyées, `[]` = plus rien).
 */
export function payloadFromCourseMetaForm(form: CourseMetaForm): CourseUpdatePayload {
  const v = form.getRawValue();
  return {
    title: v.title.trim(),
    description: v.description.trim() || null,
    subject_ids: v.subjectIds,
    education_level_ids: v.educationLevelIds,
  };
}

/** Pré-remplit le formulaire depuis un cours (`null` → chaîne vide), sans émettre. */
export function patchCourseMetaForm(
  form: CourseMetaForm,
  course: {
    title: string;
    description: string | null;
    subject_ids: string[];
    education_level_ids: string[];
  },
): void {
  form.setValue(
    {
      title: course.title,
      description: course.description ?? '',
      subjectIds: [...course.subject_ids],
      educationLevelIds: [...course.education_level_ids],
    },
    { emitEvent: false },
  );
}

/** Complétude minimale (même règle que le back) : un titre non blanc. */
export function isCourseMetaFormComplete(v: CourseMetaForm['value']): boolean {
  return !!v.title?.trim();
}
