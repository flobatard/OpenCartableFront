/**
 * Classification hiérarchique des niveaux d'étude, servie par le back
 * (`GET /api/v1/education-levels/tree`). Les champs reprennent le contrat de l'API
 * tel quel (`nom`/`code`/`systeme`/`cite` en français) : ils ne passent pas par
 * l'i18n du front — les noms de cycles/classes sont des noms propres nationaux.
 *
 * À ne pas confondre avec `SubjectLevel` (profondeur de l'arbre des matières).
 */
export interface EducationLevelNode {
  /** UUID stable : clé à persister côté données. */
  id: string;
  /** Parent immédiat (`null` pour un cycle racine). */
  parent_id: string | null;
  /** Libellé national fourni par l'API (« Collège », « 6e ») — jamais une clé de traduction. */
  nom: string;
  /** Slug stable préfixé par le système (ex. `fr.college.6e`), unique globalement. */
  code: string;
  /** Système scolaire propriétaire de l'arbre (`fr` pour l'instant). */
  systeme: string;
  /**
   * Niveau CITE/ISCED 2011 (pivot international UNESCO : 1=primaire, 2=collège,
   * 3=lycée, 6=licence, 7=master, 8=doctorat) ; `null` quand le nœud couvre
   * plusieurs niveaux CITE (ex. « Supérieur »).
   */
  cite: number | null;
  /** Âge typique d'entrée (pivot secondaire entre systèmes) ; `null` = borne ouverte. */
  age_min: number | null;
  /** Âge typique de sortie ; `null` = borne ouverte (ex. doctorat). */
  age_max: number | null;
  /** 0=cycle, 1=classe. */
  profondeur: EducationLevelDepth;
  /** Rang parmi les frères (déjà triés par le back). */
  position: number;
  children: EducationLevelNode[];
}

export type EducationLevelDepth = 0 | 1;
