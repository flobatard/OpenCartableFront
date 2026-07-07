/**
 * Cours du prof et blocs qui les composent, servis par le back
 * (`/api/v1/courses`). Les champs reprennent le contrat de l'API tel quel
 * (snake_case, français métier).
 */

/** Types de blocs du modèle (contrainte CHECK en base). */
export type BlockType = 'texte' | 'exercice' | 'ressource' | 'lien';

/**
 * Types créables depuis l'UI : « ressource » attend l'upload S3 — le back le
 * refuse aussi (un bloc ressource exige un `resource_id`).
 */
export type CreatableBlockType = Exclude<BlockType, 'ressource'>;

export interface CourseBlock {
  id: string;
  /** Rang dans le cours (tri stable `position, id` côté back). */
  position: number;
  type: BlockType;
  /** Contenu JSONB, contrat applicatif par type — rempli par les futurs éditeurs. */
  content: Record<string, unknown>;
  /** Renseigné uniquement pour les blocs `ressource`. */
  resource_id: string | null;
}

export interface CourseSummary {
  id: string;
  titre: string;
  description: string | null;
  subject_ids: string[];
  education_level_ids: string[];
  block_count: number;
  created_at: string;
  updated_at: string;
}

export interface CourseDetail extends CourseSummary {
  /** Blocs déjà ordonnés par le back. */
  blocks: CourseBlock[];
}

/** Corps du `POST /courses`. */
export interface CourseCreatePayload {
  titre: string;
  description: string | null;
  subject_ids: string[];
  education_level_ids: string[];
}
