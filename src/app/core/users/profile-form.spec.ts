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
  is_teacher: true,
  is_student: true,
  school_system: 'fr',
  public_name: 'Mme Ada',
  searchable: true,
  avatar_url: null,
  onboarding_complete: true,
  teaching: { education_level_ids: ['college'], subject_ids: ['math'] },
  learning: { education_level_ids: ['superieur'], subject_ids: ['francais'] },
};

describe('profile-form', () => {
  describe('patchFormFromProfile', () => {
    it('prefills every section', () => {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);

      expect(form.getRawValue()).toEqual({
        isTeacher: true,
        isStudent: true,
        system: 'fr',
        publicName: 'Mme Ada',
        searchable: true,
        teaching: { educationLevelIds: ['college'], subjectIds: ['math'] },
        learning: { educationLevelIds: ['superieur'], subjectIds: ['francais'] },
      });
    });

    it('keeps the levels despite the wired coherence (system set before the blocks)', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);

      expect(form.controls.teaching.controls.educationLevelIds.value).toEqual(['college']);
      expect(form.controls.learning.controls.educationLevelIds.value).toEqual(['superieur']);
    });

    it('empties the blocks of absent roles', () => {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);
      patchFormFromProfile(form, {
        ...PROFILE,
        is_student: false,
        learning: null,
      });

      expect(form.controls.learning.getRawValue()).toEqual({
        educationLevelIds: [],
        subjectIds: [],
      });
    });
  });

  describe('wireProfileFormCoherence', () => {
    it('unchecking a role empties its block', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);

      form.controls.isTeacher.setValue(false);

      expect(form.controls.teaching.getRawValue()).toEqual({
        educationLevelIds: [],
        subjectIds: [],
      });
      // L'autre bloc n'est pas touché.
      expect(form.controls.learning.controls.subjectIds.value).toEqual(['francais']);
    });

    it('changing the system empties the levels of both blocks, not the subjects', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);

      form.controls.system.setValue('uk');

      expect(form.controls.teaching.controls.educationLevelIds.value).toEqual([]);
      expect(form.controls.learning.controls.educationLevelIds.value).toEqual([]);
      expect(form.controls.teaching.controls.subjectIds.value).toEqual(['math']);
    });
  });

  describe('payloadFromForm', () => {
    it('rebuilds the full payload (round-trip with the profile)', () => {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);

      expect(payloadFromForm(form)).toEqual({
        is_teacher: true,
        is_student: true,
        school_system: 'fr',
        public_name: 'Mme Ada',
        searchable: true,
        teaching: { education_level_ids: ['college'], subject_ids: ['math'] },
        learning: { education_level_ids: ['superieur'], subject_ids: ['francais'] },
      });
    });

    it('emits null for the block of an unchecked role', () => {
      const form = buildProfileForm();
      wireProfileFormCoherence(form);
      patchFormFromProfile(form, PROFILE);
      form.controls.isStudent.setValue(false);

      expect(payloadFromForm(form).learning).toBeNull();
    });
  });

  describe('isProfileComplete', () => {
    function value(overrides: Partial<ReturnType<ReturnType<typeof buildProfileForm>['getRawValue']>>) {
      const form = buildProfileForm();
      patchFormFromProfile(form, PROFILE);
      return { ...form.getRawValue(), ...overrides };
    }

    it('true for a complete dual-role profile', () => {
      expect(isProfileComplete(value({}))).toBe(true);
    });

    it('false without any role', () => {
      expect(isProfileComplete(value({ isTeacher: false, isStudent: false }))).toBe(false);
    });

    it('false without a system', () => {
      expect(isProfileComplete(value({ system: null }))).toBe(false);
    });

    it('false when a checked role has no level or no subject', () => {
      expect(
        isProfileComplete(value({ teaching: { educationLevelIds: [], subjectIds: ['math'] } })),
      ).toBe(false);
      expect(
        isProfileComplete(
          value({ learning: { educationLevelIds: ['superieur'], subjectIds: [] } }),
        ),
      ).toBe(false);
    });

    it('ignores the block of an unchecked role', () => {
      expect(
        isProfileComplete(
          value({
            isStudent: false,
            learning: { educationLevelIds: [], subjectIds: [] },
          }),
        ),
      ).toBe(true);
    });
  });
});
