/**
 * Profil applicatif de l'utilisateur courant, servi par le back
 * (`GET /api/v1/users/me`, auto-provisionné au premier appel). Les champs
 * reprennent le contrat de l'API tel quel (snake_case, français métier).
 *
 * Les rôles sont cumulables : un compte peut être prof ET élève. Chaque rôle
 * coché a son bloc de sélections (`enseignement` / `apprentissage`), `null`
 * sinon — c'est le contexte qui porte la sémantique, pas le rôle.
 */
export interface ProfilContexte {
  education_level_ids: string[];
  subject_ids: string[];
}

export interface UserProfile {
  /** Identifiant interne (UUID) — jamais le `sub` OIDC. */
  id: string;
  /** Identifiant OIDC opaque (claim `sub` du JWT). */
  sub: string;
  email: string | null;
  est_prof: boolean;
  est_eleve: boolean;
  /** Code du système scolaire (`fr`, `uk`, …), `null` avant onboarding. */
  systeme_scolaire: string | null;
  /** `false` tant que l'onboarding bloquant n'a pas été soumis. */
  onboarding_complete: boolean;
  enseignement: ProfilContexte | null;
  apprentissage: ProfilContexte | null;
}

/** Corps du `PUT /api/v1/users/me/onboarding` (remplacement complet du profil). */
export interface OnboardingPayload {
  est_prof: boolean;
  est_eleve: boolean;
  systeme_scolaire: string;
  enseignement: ProfilContexte | null;
  apprentissage: ProfilContexte | null;
}
