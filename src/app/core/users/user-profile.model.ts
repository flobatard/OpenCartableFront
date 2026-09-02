/**
 * Profil applicatif de l'utilisateur courant, servi par le back
 * (`GET /api/v1/users/me`, auto-provisionné au premier appel). Les champs
 * reprennent le contrat de l'API tel quel (snake_case).
 *
 * Les rôles sont cumulables : un compte peut être prof ET élève. Chaque rôle
 * coché a son bloc de sélections (`teaching` / `learning`), `null`
 * sinon — c'est le contexte qui porte la sémantique, pas le rôle.
 */
export interface ProfileContext {
  education_level_ids: string[];
  subject_ids: string[];
}

export interface UserProfile {
  /** Identifiant interne (UUID) — jamais le `sub` OIDC. */
  id: string;
  /** Identifiant OIDC opaque (claim `sub` du JWT). */
  sub: string;
  email: string | null;
  is_teacher: boolean;
  is_student: boolean;
  /** Code du système scolaire (`fr`, `uk`, …), `null` avant onboarding. */
  school_system: string | null;
  /**
   * Nom d'affichage des pages publiques (catalogue de cours, J2) — seule
   * donnée d'identité montrée aux élèves ; `null` = catalogue anonyme.
   */
  public_name: string | null;
  /**
   * Opt-in à la recherche publique de professeurs (J3). Le flag seul ne
   * suffit pas à remonter : il faut aussi un `public_name` et ≥1 cours public
   * (règle portée par le back).
   */
  searchable: boolean;
  /**
   * URL présignée (TTL court) de la photo de profil, `null` si aucune.
   * Re-mintée par le back à chaque lecture/mutation du profil — ne jamais
   * la persister côté front (elle expire).
   */
  avatar_url: string | null;
  /** `false` tant que l'onboarding bloquant n'a pas été soumis. */
  onboarding_complete: boolean;
  teaching: ProfileContext | null;
  learning: ProfileContext | null;
}

/** Corps du `PUT /api/v1/users/me/onboarding` (remplacement complet du profil). */
export interface OnboardingPayload {
  is_teacher: boolean;
  is_student: boolean;
  school_system: string;
  /** Optionnel — blanc/absent devient `null` côté back (catalogue anonyme). */
  public_name: string | null;
  /** PUT = remplacement complet : un payload sans le champ « décoche ». */
  searchable: boolean;
  teaching: ProfileContext | null;
  learning: ProfileContext | null;
}

/** Réponse du `POST /api/v1/users/me/avatar` (motif `ResourcePresign`, réduit). */
export interface AvatarPresign {
  upload_url: string;
  expires_in: number;
}

/**
 * Contrat d'upload de l'avatar : la modale de recadrage exporte TOUJOURS un
 * carré `AVATAR_SIZE`, encodé en **WebP** — seul format de la whitelist back
 * qui préserve la TRANSPARENCE (le JPEG l'aplatissait en noir) sans le
 * surpoids d'un PNG 512×512. `MAX_AVATAR_BYTES` est le miroir de
 * `AVATAR_MAX_BYTES` du back (garde défensive : un export canvas 512×512
 * reste très en dessous).
 */
export const AVATAR_MIME = 'image/webp';
export const AVATAR_SIZE = 512;
export const MAX_AVATAR_BYTES = 5_242_880;

/** Whitelist des mimes acceptés au presign (miroir d'`AVATAR_EXTENSIONS`, back). */
export const AVATAR_MIMES = ['image/webp', 'image/png', 'image/jpeg'] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];

/**
 * Mime RÉELLEMENT produit par l'export canvas, borné à la whitelist back.
 * `toBlob` retombe silencieusement sur PNG quand le navigateur n'encode pas
 * le type demandé (comportement spécifié) : le mime ne peut donc pas être
 * une constante, il se lit sur le blob — le `confirm` du back compare le
 * `ContentType` de l'objet S3 au mime déclaré au presign et répondrait 409
 * sur le moindre écart. Repli PNG, celui de la spec.
 */
export function avatarMimeOf(blob: Blob): AvatarMime {
  return (AVATAR_MIMES as readonly string[]).includes(blob.type)
    ? (blob.type as AvatarMime)
    : 'image/png';
}
