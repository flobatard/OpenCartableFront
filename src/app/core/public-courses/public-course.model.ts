import type { CourseBlock } from '../courses/course.model';
import type { CourseStyleSettings } from '../courses/course-style.service';
import type { ResourceType } from '../resources/resource.model';

/**
 * Contrat des routes publiques élèves (`/api/v1/public/*`, J2) — lecture
 * seule, sans identité ni Bearer. Champs en snake_case comme le reste de
 * l'API. Différences avec le contrat prof : matières/niveaux dénormalisés en
 * **noms** (les taxonomies sont derrière JWT), ressources embarquées dans le
 * détail (toutes `disponible`, jamais de statut ni de s3_key), et le
 * `content` des blocs `exercice` ne porte JAMAIS les `reponse_attendue`
 * (filtrage structurel côté back).
 */

/** Mode d'accès d'une page élève : lien de partage ou cours public direct. */
export interface PublicAccess {
  mode: 'token' | 'public';
  /** Token de partage (mode `token`) ou id du cours (mode `public`). */
  key: string;
}

/** Ressource du détail public — toujours `disponible`, par contrat. */
export interface PublicResource {
  id: string;
  type: ResourceType;
  nom_original: string;
  taille: number;
  mime: string;
}

/** Cours du catalogue public d'un prof. */
export interface PublicCourseSummary {
  id: string;
  titre: string;
  description: string | null;
  /** Noms de matières, déjà triés par le back. */
  subjects: string[];
  /** Noms de niveaux d'étude, déjà triés par le back. */
  education_levels: string[];
  block_count: number;
  preview_settings: Partial<CourseStyleSettings>;
  updated_at: string;
}

/** Détail complet filtré servi à la vue élève (blocs ordonnés + ressources). */
export interface PublicCourseDetail extends PublicCourseSummary {
  blocks: CourseBlock[];
  resources: PublicResource[];
}

/** Catalogue public d'un prof (`nom_public` null = catalogue anonyme). */
export interface PublicProfessor {
  nom_public: string | null;
  courses: PublicCourseSummary[];
}
