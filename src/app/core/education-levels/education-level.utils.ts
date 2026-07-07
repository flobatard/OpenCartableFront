import { EducationLevelNode } from './education-level.model';

/**
 * Helpers purs de l'arbre des niveaux d'étude. Volontairement minimaux :
 * l'arbre est petit (~22 nœuds, 2 profondeurs) et toujours affiché déplié —
 * pas de treeview repliable ni de recherche (contrairement à `subject.utils.ts`,
 * qu'on ne généralise pas pour ne pas coupler les deux pickers).
 */

/** Une ligne d'affichage : le nœud + sa profondeur d'indentation. */
export interface EducationLevelRow {
  node: EducationLevelNode;
  depth: number;
}

/** Aplatit l'arbre en lignes ordonnées (parcours préfixe, arbre entièrement déplié). */
export function flattenTree(roots: EducationLevelNode[]): EducationLevelRow[] {
  const rows: EducationLevelRow[] = [];
  const walk = (nodes: EducationLevelNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}

/** Recherche un nœud par id, à n'importe quelle profondeur. */
export function findById(
  roots: EducationLevelNode[],
  id: string,
): EducationLevelNode | undefined {
  for (const node of roots) {
    if (node.id === id) {
      return node;
    }
    const found = findById(node.children, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Réordonne des ids sélectionnés selon l'ordre de l'arbre. Les ids inconnus
 * de l'arbre (nœud supprimé, arbre pas encore chargé) sont PRÉSERVÉS en fin
 * de tableau, dans leur ordre d'origine : le contrôle ne perd jamais de données.
 */
export function sortByTreeOrder(roots: EducationLevelNode[], ids: string[]): string[] {
  const rank = new Map(flattenTree(roots).map((row, i) => [row.node.id, i]));
  const known = ids.filter((id) => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  const unknown = ids.filter((id) => !rank.has(id));
  return [...known, ...unknown];
}
