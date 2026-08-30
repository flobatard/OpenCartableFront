import { UserProfile } from '../core/users/user-profile.model';

/** Profil de référence : prof seul, onboarding non complété. */
export const USER_PROFILE_FIXTURE: UserProfile = {
  id: 'user-1',
  sub: 'prof-123',
  email: 'prof@example.org',
  is_teacher: false,
  is_student: false,
  school_system: null,
  public_name: null,
  searchable: false,
  avatar_url: null,
  onboarding_complete: false,
  teaching: null,
  learning: null,
};

/** Profil complet : prof + élève, onboarding terminé. */
export const USER_PROFILE_ONBOARDED_FIXTURE: UserProfile = {
  ...USER_PROFILE_FIXTURE,
  is_teacher: true,
  is_student: true,
  school_system: 'fr',
  onboarding_complete: true,
  teaching: { education_level_ids: ['fr-college-6e'], subject_ids: ['math'] },
  learning: { education_level_ids: ['fr-superieur-licence'], subject_ids: ['francais'] },
};

/**
 * Profil onboardé dont les ids existent dans `EDUCATION_LEVELS_FIXTURE` et
 * `SUBJECTS_FIXTURE` : les pickers peuvent résoudre les chips (page profil).
 */
export const USER_PROFILE_ALIGNED_FIXTURE: UserProfile = {
  ...USER_PROFILE_ONBOARDED_FIXTURE,
  teaching: { education_level_ids: ['college'], subject_ids: ['math'] },
  learning: { education_level_ids: ['superieur'], subject_ids: ['francais'] },
};
