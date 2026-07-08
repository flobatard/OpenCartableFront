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
  /** Titre commun facultatif (tous types), distinct du `content`. */
  titre: string | null;
  /** Description commune facultative (tous types), distincte du `content`. */
  description: string | null;
  /** Contenu JSONB, contrat applicatif par type — rempli par les futurs éditeurs. */
  content: Record<string, unknown>;
  /** Renseigné uniquement pour les blocs `ressource`. */
  resource_id: string | null;
}

/**
 * Question d'un bloc exercice telle qu'échangée avec le back.
 * `id: null` = nouvelle question : le back génère un uuid4 **stable à vie**
 * (les soumissions élèves J2 référenceront `(block_id, question_id)`) — le
 * front doit réécrire dans son formulaire les ids retournés par le PATCH.
 */
export type ExerciseQuestionPayload = {
  id: string | null;
  /** Énoncé markdown (mêmes règles que le bloc texte). */
  enonce: string;
  /** Seul type admis aujourd'hui (extensible : QCM…). */
  type: 'texte_libre';
  /** Corrigé du prof, texte simple — jamais montré aux élèves. */
  reponse_attendue: string;
};

/**
 * `content` d'un PATCH de bloc exercice : sujet markdown + questions
 * ordonnées. Sémantique remplacement — une question absente est supprimée.
 * Alias `type` (pas `interface`) : la signature d'index implicite le rend
 * assignable au `Record<string, unknown>` d'`updateBlockContent`.
 */
export type ExerciseContentPayload = {
  enonce: string;
  questions: ExerciseQuestionPayload[];
};

/**
 * Champs communs éditables d'un bloc (titre/description). Sert de méta à la
 * création (`POST …/blocks`) et au PATCH partiel (`PATCH …/blocks/{id}`),
 * indépendamment du `content` propre à chaque type.
 */
export interface BlockMetaPayload {
  titre: string | null;
  description: string | null;
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
