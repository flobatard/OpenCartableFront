import type { CourseBlock } from '../courses/course.model';
import type { CourseStyleSettings } from '../courses/course-style.service';
import type { ResourceType } from '../resources/resource.model';

/**
 * Contrat des routes publiques élèves (`/api/v1/public/*`, J2) — lecture
 * seule, sans identité ni Bearer. Champs en snake_case comme le reste de
 * l'API. Différences avec le contrat prof : matières/niveaux dénormalisés en
 * **noms** (les taxonomies sont derrière JWT), ressources embarquées dans le
 * détail (toutes `available`, jamais de `status` ni de s3_key), et le
 * `content` des blocs `exercise` ne porte JAMAIS les `expected_answer`
 * (filtrage structurel côté back).
 */

/** Mode d'accès d'une page élève : lien de partage ou cours public direct. */
export interface PublicAccess {
  mode: 'token' | 'public';
  /** Token de partage (mode `token`) ou id du cours (mode `public`). */
  key: string;
}

/** Ressource du détail public — toujours `available`, par contrat. */
export interface PublicResource {
  id: string;
  type: ResourceType;
  original_name: string;
  size: number;
  mime: string;
}

/** Cours du catalogue public d'un prof. */
export interface PublicCourseSummary {
  id: string;
  title: string;
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

/** Catalogue public d'un prof (`public_name` null = catalogue anonyme). */
export interface PublicProfessor {
  public_name: string | null;
  /** URL présignée (TTL court) de la photo de profil, `null` si aucune. */
  avatar_url: string | null;
  courses: PublicCourseSummary[];
}
