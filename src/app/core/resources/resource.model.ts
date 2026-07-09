/**
 * Bibliothèque de ressources S3 d'un cours, servie par le back
 * (`/api/v1/courses/{id}/resources`). Les champs reprennent le contrat de
 * l'API tel quel (snake_case, français métier). Les ressources sont
 * indépendantes des blocs : un bloc `document` peut en pointer une
 * (`CourseBlock.resource_id`), jamais l'inverse.
 */

/** Types de ressource ouverts au MVP (`module` = sandbox HTML/JS, jalon J4). */
export type ResourceType = 'document' | 'image' | 'audio' | 'video';

/**
 * `en_attente` = ligne créée avant l'upload direct navigateur→S3, pas encore
 * confirmée (l'objet n'est peut-être pas dans le bucket) ; `disponible` =
 * upload vérifié (HEAD S3), la ressource est utilisable.
 */
export type ResourceStatus = 'en_attente' | 'disponible';

/** Miroir du `ResourceRead` du back (pas de `s3_key` : détail interne). */
export interface CourseResource {
  id: string;
  type: ResourceType;
  nom_original: string;
  /** Octets, déclarés au presign et vérifiés à la confirmation. */
  taille: number;
  mime: string;
  statut: ResourceStatus;
  created_at: string;
  updated_at: string;
}

/** Corps du `POST /courses/{id}/resources` (déclaration avant upload). */
export interface ResourceCreatePayload {
  nom_original: string;
  mime: string;
  taille: number;
  type: ResourceType;
}

/** Réponse du presign : URL PUT à consommer directement depuis le navigateur. */
export interface ResourcePresign {
  resource_id: string;
  s3_key: string;
  upload_url: string;
  statut: ResourceStatus;
  expires_in: number;
}

/** Réponse du presign de lecture (TTL court). */
export interface ResourceDownload {
  download_url: string;
  expires_in: number;
}
