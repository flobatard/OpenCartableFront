import { PublicCourseSummary } from '../public-courses/public-course.model';

/**
 * Modèles de la recherche publique — miroir des schémas
 * `app/search/schemas.py` du back (enveloppe paginée).
 */
export interface SearchPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Un résultat cours = la carte publique (même contrat). */
export type SearchCourseResult = PublicCourseSummary;

export interface SearchTeacherResult {
  id: string;
  public_name: string;
  /** URL présignée (TTL court) de la photo de profil, `null` si aucune. */
  avatar_url: string | null;
  /** Matières que le prof déclare enseigner — noms dénormalisés, triés. */
  subjects: string[];
  public_course_count: number;
}

/** Paramètres d'une recherche, portés par les query params de la page. */
export interface SearchQuery {
  q: string;
  subjectId: string | null;
  educationLevelId: string | null;
  /** Page 1-indexée (traduite en offset par le service). */
  page: number;
}
