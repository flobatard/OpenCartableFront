import { UserProfile } from './user-profile.model';
import {
  buildProfileForm,
  isProfileComplete,
  patchFormFromProfile,
  payloadFromForm,
  wireProfileFormCoherence,
} from './profile-form';

const PROFILE: UserProfile = {
  id: 'user-1',
  sub: 'prof-123',
  email: null,
  est_prof: true,
  est_eleve: true,
  systeme_scolaire: 'fr',
  onboarding_complete: true,
  enseignement: { education_level_ids: ['college'], subject_ids: ['math'] },
  apprentissage: { education_level_ids: ['superieur'], subject_ids: ['francais'] },
};

describe('profile-form', () => {
  describe('patchFormFromProfile', () => {
    it('pré-remplit toutes les sections', () => {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);

      expect(form.getRawValue()).toEqual({
        estProf: true,
        estEleve: true,
        systeme: 'fr',
        enseignement: { educationLevelIds: ['college'], subjectIds: ['math'] },
        apprentissage: { educationLevelIds: ['superieur'], subjectIds: ['francais'] },
      });
    });

    it('ne perd pas les niveaux malgré la cohérence câblée (systeme posé avant les blocs)', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);

      expect(form.controls.enseignement.controls.educationLevelIds.value).toEqual(['college']);
      expect(form.controls.apprentissage.controls.educationLevelIds.value).toEqual(['superieur']);
    });

    it('vide les blocs des rôles absents', () => {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);
      patchFormFromProfile(form, {
        ...PROFILE,
        est_eleve: false,
        apprentissage: null,
      });

      expect(form.controls.apprentissage.getRawValue()).toEqual({
        educationLevelIds: [],
        subjectIds: [],
      });
    });
  });

  describe('wireProfileFormCoherence', () => {
    it('décocher un rôle vide son bloc', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);

      form.controls.estProf.setValue(false);

      expect(form.controls.enseignement.getRawValue()).toEqual({
        educationLevelIds: [],
        subjectIds: [],
      });
      // L'autre bloc n'est pas touché.
      expect(form.controls.apprentissage.controls.subjectIds.value).toEqual(['francais']);
    });

    it('changer de système vide les niveaux des deux blocs, pas les matières', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);

      form.controls.systeme.setValue('uk');

      expect(form.controls.enseignement.controls.educationLevelIds.value).toEqual([]);
      expect(form.controls.apprentissage.controls.educationLevelIds.value).toEqual([]);
      expect(form.controls.enseignement.controls.subjectIds.value).toEqual(['math']);
    });
  });

  describe('payloadFromForm', () => {
    it('reconstruit le payload complet (aller-retour avec le profil)', () => {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);

      expect(payloadFromForm(form)).toEqual({
        est_prof: true,
        est_eleve: true,
        systeme_scolaire: 'fr',
        enseignement: { education_level_ids: ['college'], subject_ids: ['math'] },
        apprentissage: { education_level_ids: ['superieur'], subject_ids: ['francais'] },
      });
    });

    it('émet null pour le bloc d’un rôle décoché', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);
      form.controls.estEleve.setValue(false);

      expect(payloadFromForm(form).apprentissage).toBeNull();
    });
  });

  describe('isProfileComplete', () => {
    function value(overrides: Partial<ReturnType<ReturnType<typeof buildProfileForm>['getRawValue']>>) {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);
      return { ...form.getRawValue(), ...overrides };
    }

    it('vrai pour un profil double rôle complet', () => {
      expect(isProfileComplete(value({}))).toBe(true);
    });

    it('faux sans aucun rôle', () => {
      expect(isProfileComplete(value({ estProf: false, estEleve: false }))).toBe(false);
    });

    it('faux sans système', () => {
      expect(isProfileComplete(value({ systeme: null }))).toBe(false);
    });

    it('faux si un rôle coché n’a pas de niveau ou pas de matière', () => {
      expect(
        isProfileComplete(value({ enseignement: { educationLevelIds: [], subjectIds: ['math'] } })),
      ).toBe(false);
      expect(
        isProfileComplete(
          value({ apprentissage: { educationLevelIds: ['superieur'], subjectIds: [] } }),
        ),
      ).toBe(false);
    });

    it('ignore le bloc d’un rôle décoché', () => {
      expect(
        isProfileComplete(
          value({
            estEleve: false,
            apprentissage: { educationLevelIds: [], subjectIds: [] },
          }),
        ),
      ).toBe(true);
    });
  });
});
