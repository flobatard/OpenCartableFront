import type { CourseStyleSettings } from './course-style.service';

/**
 * Cours du prof et blocs qui les composent, servis par le back
 * (`/api/v1/courses`). Les champs reprennent le contrat de l'API tel quel
 * (snake_case).
 */

/**
 * Types de blocs du modèle (contrainte CHECK en base). Tous créables depuis
 * l'UI : `document` naît vide (pont vers une ressource de la bibliothèque,
 * choisie ensuite dans l'éditeur), `module` naît vide lui aussi (pont vers
 * un module interactif de la bibliothèque de modules du cours).
 */
export type BlockType = 'text' | 'exercise' | 'document' | 'module';

export interface CourseBlock {
  id: string;
  /** Rang dans le cours (tri stable `position, id` côté back). */
  position: number;
  type: BlockType;
  /** Titre commun facultatif (tous types), distinct du `content`. */
  title: string | null;
  /** Description commune facultative (tous types), distincte du `content`. */
  description: string | null;
  /** Contenu JSONB, contrat applicatif par type — rempli par les futurs éditeurs. */
  content: Record<string, unknown>;
  /**
   * Blocs `document` uniquement : ressource du cours pointée, `null` = bloc
   * vide à la création. Supprimer la ressource supprime le bloc (FK CASCADE).
   */
  resource_id: string | null;
  /**
   * Blocs `module` uniquement : module interactif du cours pointé, `null` =
   * bloc vide à la création. Supprimer le module supprime le bloc (FK
   * CASCADE).
   */
  module_id: string | null;
}

/**
 * `content` d'un PATCH de bloc document : éditorial d'affichage seulement —
 * la ressource pointée passe par `updateBlockResource` (colonne, pas content).
 * Alias `type` (pas `interface`) : assignable au `Record<string, unknown>`
 * d'`updateBlockContent`.
 */
export type DocumentContentPayload = {
  caption: string | null;
  display: 'inline' | 'download';
};

/**
 * Question d'un bloc exercice telle qu'échangée avec le back.
 * `id: null` = nouvelle question : le back génère un uuid4 **stable à vie**
 * (les soumissions élèves J2 référenceront `(block_id, question_id)`) — le
 * front doit réécrire dans son formulaire les ids retournés par le PATCH.
 */
export type ExerciseQuestionPayload = {
  id: string | null;
  /** Énoncé markdown (mêmes règles que le bloc texte). */
  statement: string;
  /** Seul type admis aujourd'hui (extensible : QCM…). */
  type: 'free_text';
  /** Corrigé du prof, texte simple — jamais montré aux élèves. */
  expected_answer: string;
};

/**
 * `content` d'un PATCH de bloc exercice : sujet markdown + questions
 * ordonnées. Sémantique remplacement — une question absente est supprimée.
 * Alias `type` (pas `interface`) : la signature d'index implicite le rend
 * assignable au `Record<string, unknown>` d'`updateBlockContent`.
 */
export type ExerciseContentPayload = {
  statement: string;
  questions: ExerciseQuestionPayload[];
};

/**
 * Champs communs éditables d'un bloc (titre/description). Sert de méta à la
 * création (`POST …/blocks`) et au PATCH partiel (`PATCH …/blocks/{id}`),
 * indépendamment du `content` propre à chaque type.
 */
export interface BlockMetaPayload {
  title: string | null;
  description: string | null;
}

/**
 * Régime d'accès élève d'un cours (J2) : `public` = URL directe + catalogue
 * public du prof ; `private` = liens de partage à token uniquement ; `draft`
 * (défaut) = inaccessible publiquement, liens suspendus.
 */
export type CourseVisibility = 'public' | 'private' | 'draft';

export interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  subject_ids: string[];
  education_level_ids: string[];
  block_count: number;
  visibility: CourseVisibility;
  created_at: string;
  updated_at: string;
  /**
   * Réglages d'affichage du rendu markdown (renvoyés par le back). Absent ou
   * `{}` = cours jamais personnalisé → le front applique ses défauts
   * (cf. `CourseStyleService`). Écrits via `PUT /courses/{id}/preview`.
   */
  preview_settings?: Partial<CourseStyleSettings>;
}

export interface CourseDetail extends CourseSummary {
  /** Blocs déjà ordonnés par le back. */
  blocks: CourseBlock[];
}

/** Corps du `POST /courses`. */
export interface CourseCreatePayload {
  title: string;
  description: string | null;
  subject_ids: string[];
  education_level_ids: string[];
}
