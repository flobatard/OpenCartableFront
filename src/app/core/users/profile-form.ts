import { FormControl, FormGroup } from '@angular/forms';
import { OnboardingPayload, UserProfile } from './user-profile.model';

/**
 * Formulaire de profil partagé entre l'onboarding (stepper) et la page
 * « Mon profil » (édition à plat) : même forme, mêmes règles de cohérence,
 * même mapping vers le payload API. Seule la présentation diffère —
 * la logique vit ici pour n'exister qu'une fois.
 */

/** Un bloc de sélections par contexte (enseigne / apprend). */
function blockGroup() {
  return new FormGroup({
    educationLevelIds: new FormControl<string[]>([], { nonNullable: true }),
    subjectIds: new FormControl<string[]>([], { nonNullable: true }),
  });
}

export function buildProfileForm() {
  return new FormGroup({
    isTeacher: new FormControl(false, { nonNullable: true }),
    isStudent: new FormControl(false, { nonNullable: true }),
    system: new FormControl<string | null>(null),
    // Nom affiché sur les pages publiques (catalogue public) — optionnel.
    publicName: new FormControl('', { nonNullable: true }),
    // Opt-in recherche publique de profs — l'onboarding ne l'affiche
    // pas (défaut false, opt-in réfléchi depuis la page profil).
    searchable: new FormControl(false, { nonNullable: true }),
    teaching: blockGroup(),
    learning: blockGroup(),
  });
}

export type ProfileForm = ReturnType<typeof buildProfileForm>;

/**
 * Câble les règles de cohérence :
 * - décocher un rôle vide les sélections de son bloc ;
 * - changer de système scolaire vide les niveaux choisis des deux blocs
 *   (ils appartiennent au système), les matières sont conservées.
 */
export function wireProfileFormCoherence(form: ProfileForm): void {
  form.controls.isTeacher.valueChanges.subscribe((isTeacher) => {
    if (!isTeacher) {
      form.controls.teaching.reset();
    }
  });
  form.controls.isStudent.valueChanges.subscribe((isStudent) => {
    if (!isStudent) {
      form.controls.learning.reset();
    }
  });
  form.controls.system.valueChanges.subscribe(() => {
    form.controls.teaching.controls.educationLevelIds.setValue([]);
    form.controls.learning.controls.educationLevelIds.setValue([]);
  });
}

/**
 * Pré-remplit le formulaire depuis le profil API.
 *
 * Contrat d'ordre : `system` est posé AVANT les blocs — la cohérence câblée
 * ({@link wireProfileFormCoherence}) vide les niveaux à chaque changement de
 * système et écraserait sinon les valeurs patchées.
 */
export function patchFormFromProfile(form: ProfileForm, profile: UserProfile): void {
  form.controls.isTeacher.setValue(profile.is_teacher);
  form.controls.isStudent.setValue(profile.is_student);
  form.controls.system.setValue(profile.school_system);
  form.controls.publicName.setValue(profile.public_name ?? '');
  form.controls.searchable.setValue(profile.searchable);
  form.controls.teaching.setValue({
    educationLevelIds: [...(profile.teaching?.education_level_ids ?? [])],
    subjectIds: [...(profile.teaching?.subject_ids ?? [])],
  });
  form.controls.learning.setValue({
    educationLevelIds: [...(profile.learning?.education_level_ids ?? [])],
    subjectIds: [...(profile.learning?.subject_ids ?? [])],
  });
}

/** Corps du `PUT /users/me/onboarding` : blocs `null` pour les rôles décochés. */
export function payloadFromForm(form: ProfileForm): OnboardingPayload {
  const v = form.getRawValue();
  return {
    is_teacher: v.isTeacher,
    is_student: v.isStudent,
    school_system: v.system ?? '',
    public_name: v.publicName.trim() || null,
    searchable: v.searchable,
    teaching: v.isTeacher
      ? {
          education_level_ids: v.teaching.educationLevelIds,
          subject_ids: v.teaching.subjectIds,
        }
      : null,
    learning: v.isStudent
      ? {
          education_level_ids: v.learning.educationLevelIds,
          subject_ids: v.learning.subjectIds,
        }
      : null,
  };
}

/**
 * Règles de complétude (mêmes que la validation back) : au moins un rôle,
 * un système choisi, et ≥1 niveau + ≥1 matière pour chaque rôle coché.
 */
export function isProfileComplete(v: ProfileForm['value']): boolean {
  if (!v.isTeacher && !v.isStudent) {
    return false;
  }
  if (!v.system) {
    return false;
  }
  if (
    v.isTeacher &&
    (!(v.teaching?.educationLevelIds?.length ?? 0) || !(v.teaching?.subjectIds?.length ?? 0))
  ) {
    return false;
  }
  if (
    v.isStudent &&
    (!(v.learning?.educationLevelIds?.length ?? 0) || !(v.learning?.subjectIds?.length ?? 0))
  ) {
    return false;
  }
  return true;
}
