import { UserProfile } from '../core/users/user-profile.model';

/** Profil de référence : prof seul, onboarding non complété. */
export const USER_PROFILE_FIXTURE: UserProfile = {
  id: 'user-1',
  sub: 'prof-123',
  email: 'prof@example.org',
  est_prof: false,
  est_eleve: false,
  systeme_scolaire: null,
  onboarding_complete: false,
  enseignement: null,
  apprentissage: null,
};

/** Profil complet : prof + élève, onboarding terminé. */
export const USER_PROFILE_ONBOARDED_FIXTURE: UserProfile = {
  ...USER_PROFILE_FIXTURE,
  est_prof: true,
  est_eleve: true,
  systeme_scolaire: 'fr',
  onboarding_complete: true,
  enseignement: { education_level_ids: ['fr-college-6e'], subject_ids: ['math'] },
  apprentissage: { education_level_ids: ['fr-superieur-licence'], subject_ids: ['francais'] },
};

/**
 * Profil onboardé dont les ids existent dans `EDUCATION_LEVELS_FIXTURE` et
 * `SUBJECTS_FIXTURE` : les pickers peuvent résoudre les chips (page profil).
 */
export const USER_PROFILE_ALIGNED_FIXTURE: UserProfile = {
  ...USER_PROFILE_ONBOARDED_FIXTURE,
  enseignement: { education_level_ids: ['college'], subject_ids: ['math'] },
  apprentissage: { education_level_ids: ['superieur'], subject_ids: ['francais'] },
};
