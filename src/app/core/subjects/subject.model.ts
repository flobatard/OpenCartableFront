/**
 * Taxonomie hiérarchique des matières, servie par le back
 * (`GET /api/v1/subjects/tree`). Les champs reprennent le contrat de l'API tel quel
 * (`nom`/`code`/`profondeur` en français) : ils ne passent pas par l'i18n du front.
 */
export interface SubjectNode {
  /** UUID stable : clé à persister côté données. */
  id: string;
  /** Parent immédiat (`null` pour une discipline racine). */
  parent_id: string | null;
  /** Libellé français fourni par l'API — jamais une clé de traduction. */
  nom: string;
  /** Chemin slug complet, unique globalement : utilisable comme clé de route/URL. */
  code: string;
  /** 0=discipline, 1=domaine, 2=sous-domaine, 3=sujet (une branche peut s'arrêter avant 3). */
  profondeur: SubjectLevel;
  /** Rang parmi les frères (déjà triés par le back). */
  position: number;
  children: SubjectNode[];
}

export type SubjectLevel = 0 | 1 | 2 | 3;

/** Un résultat de recherche aplati : le nœud trouvé + son chemin racine→nœud (inclus). */
export interface SubjectMatch {
  node: SubjectNode;
  path: SubjectNode[];
}
