import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CourseCreatePayload } from './course.model';

/**
 * Formulaire de création de cours : helpers purs (forme du FormGroup typé,
 * mapping payload, complétude), sur le modèle de `core/users/profile-form.ts`.
 * Pas de règles de cohérence croisées : le système scolaire qui filtre le
 * picker de niveaux vient du profil et ne change pas sur la page.
 */

export function buildCourseForm() {
  return new FormGroup({
    titre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(300)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    subjectIds: new FormControl<string[]>([], { nonNullable: true }),
    educationLevelIds: new FormControl<string[]>([], { nonNullable: true }),
  });
}

export type CourseForm = ReturnType<typeof buildCourseForm>;

/** Corps du `POST /courses` : titre trimé, description vide → `null`. */
export function payloadFromCourseForm(form: CourseForm): CourseCreatePayload {
  const v = form.getRawValue();
  const description = v.description.trim();
  return {
    titre: v.titre.trim(),
    description: description || null,
    subject_ids: v.subjectIds,
    education_level_ids: v.educationLevelIds,
  };
}

/** Complétude minimale (même règle que le back) : un titre non blanc. */
export function isCourseFormComplete(v: CourseForm['value']): boolean {
  return !!v.titre?.trim();
}
