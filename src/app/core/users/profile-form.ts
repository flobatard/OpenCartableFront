import { FormControl, FormGroup } from '@angular/forms';
import { OnboardingPayload, UserProfile } from './user-profile.model';

/**
 * Formulaire de profil partagé entre l'onboarding (stepper) et la page
 * « Mon profil » (édition à plat) : même forme, mêmes règles de cohérence,
 * même mapping vers le payload API. Seule la présentation diffère —
 * la logique vit ici pour n'exister qu'une fois.
 */

/** Un bloc de sélections par contexte (enseigne / apprend). */
function blocGroup() {
  return new FormGroup({
    educationLevelIds: new FormControl<string[]>([], { nonNullable: true }),
    subjectIds: new FormControl<string[]>([], { nonNullable: true }),
  });
}

export function buildProfileForm() {
  return new FormGroup({
    estProf: new FormControl(false, { nonNullable: true }),
    estEleve: new FormControl(false, { nonNullable: true }),
    systeme: new FormControl<string | null>(null),
    enseignement: blocGroup(),
    apprentissage: blocGroup(),
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
  form.controls.estProf.valueChanges.subscribe((estProf) => {
    if (!estProf) {
      form.controls.enseignement.reset();
    }
  });
  form.controls.estEleve.valueChanges.subscribe((estEleve) => {
    if (!estEleve) {
      form.controls.apprentissage.reset();
    }
  });
  form.controls.systeme.valueChanges.subscribe(() => {
    form.controls.enseignement.controls.educationLevelIds.setValue([]);
    form.controls.apprentissage.controls.educationLevelIds.setValue([]);
  });
}

/**
 * Pré-remplit le formulaire depuis le profil API.
 *
 * Contrat d'ordre : `systeme` est posé AVANT les blocs — la cohérence câblée
 * ({@link wireProfileFormCoherence}) vide les niveaux à chaque changement de
 * système et écraserait sinon les valeurs patchées.
 */
export function patchFormFromProfile(form: ProfileForm, profile: UserProfile): void {
  form.controls.estProf.setValue(profile.est_prof);
  form.controls.estEleve.setValue(profile.est_eleve);
  form.controls.systeme.setValue(profile.systeme_scolaire);
  form.controls.enseignement.setValue({
    educationLevelIds: [...(profile.enseignement?.education_level_ids ?? [])],
    subjectIds: [...(profile.enseignement?.subject_ids ?? [])],
  });
  form.controls.apprentissage.setValue({
    educationLevelIds: [...(profile.apprentissage?.education_level_ids ?? [])],
    subjectIds: [...(profile.apprentissage?.subject_ids ?? [])],
  });
}

/** Corps du `PUT /users/me/onboarding` : blocs `null` pour les rôles décochés. */
export function payloadFromForm(form: ProfileForm): OnboardingPayload {
  const v = form.getRawValue();
  return {
    est_prof: v.estProf,
    est_eleve: v.estEleve,
    systeme_scolaire: v.systeme ?? '',
    enseignement: v.estProf
      ? {
          education_level_ids: v.enseignement.educationLevelIds,
          subject_ids: v.enseignement.subjectIds,
        }
      : null,
    apprentissage: v.estEleve
      ? {
          education_level_ids: v.apprentissage.educationLevelIds,
          subject_ids: v.apprentissage.subjectIds,
        }
      : null,
  };
}

/**
 * Règles de complétude (mêmes que la validation back) : au moins un rôle,
 * un système choisi, et ≥1 niveau + ≥1 matière pour chaque rôle coché.
 */
export function isProfileComplete(v: ProfileForm['value']): boolean {
  if (!v.estProf && !v.estEleve) {
    return false;
  }
  if (!v.systeme) {
    return false;
  }
  if (
    v.estProf &&
    (!(v.enseignement?.educationLevelIds?.length ?? 0) ||
      !(v.enseignement?.subjectIds?.length ?? 0))
  ) {
    return false;
  }
  if (
    v.estEleve &&
    (!(v.apprentissage?.educationLevelIds?.length ?? 0) ||
      !(v.apprentissage?.subjectIds?.length ?? 0))
  ) {
    return false;
  }
  return true;
}
