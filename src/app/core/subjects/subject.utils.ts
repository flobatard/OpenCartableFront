import { SubjectMatch, SubjectNode } from './subject.model';

/** Sépare les niveaux du chemin d'ancêtres à l'affichage : « Maths › Algèbre › … ». */
export const PATH_SEPARATOR = ' › ';

/** Normalise pour comparaison insensible à la casse et aux accents. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Recherche en profondeur d'un nœud par UUID. */
export function findById(roots: readonly SubjectNode[], id: string): SubjectNode | undefined {
  return findBy(roots, (node) => node.id === id);
}

/** Recherche en profondeur d'un nœud par `code` (chemin slug stable). */
export function findByCode(roots: readonly SubjectNode[], code: string): SubjectNode | undefined {
  return findBy(roots, (node) => node.code === code);
}

function findBy(
  roots: readonly SubjectNode[],
  predicate: (node: SubjectNode) => boolean,
): SubjectNode | undefined {
  for (const node of roots) {
    if (predicate(node)) {
      return node;
    }
    const found = findBy(node.children, predicate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Chemin d'ancêtres d'un nœud, de la racine jusqu'au nœud inclus (pour fil d'Ariane).
 * Renvoie `[]` si l'id est introuvable.
 */
export function ancestorPath(roots: readonly SubjectNode[], id: string): SubjectNode[] {
  const path: SubjectNode[] = [];
  const walk = (nodes: readonly SubjectNode[]): boolean => {
    for (const node of nodes) {
      path.push(node);
      if (node.id === id || walk(node.children)) {
        return true;
      }
      path.pop();
    }
    return false;
  };
  return walk(roots) ? path : [];
}

/**
 * Aplatit l'arbre en ne gardant que les nœuds dont le `nom` contient `term`
 * (insensible casse/accents), à tous les niveaux ; chaque résultat porte son chemin
 * d'ancêtres. Un terme vide renvoie `[]`.
 */
export function flattenFiltered(roots: readonly SubjectNode[], term: string): SubjectMatch[] {
  const needle = normalize(term);
  if (!needle) {
    return [];
  }
  const matches: SubjectMatch[] = [];
  const path: SubjectNode[] = [];
  const walk = (nodes: readonly SubjectNode[]): void => {
    for (const node of nodes) {
      path.push(node);
      if (normalize(node.nom).includes(needle)) {
        matches.push({ node, path: [...path] });
      }
      walk(node.children);
      path.pop();
    }
  };
  walk(roots);
  return matches;
}

/** Joint les `nom` d'un chemin par le séparateur d'affichage. */
export function formatPath(path: readonly SubjectNode[]): string {
  return path.map((node) => node.nom).join(PATH_SEPARATOR);
}

/** Une ligne aplatie de treeview : le nœud + sa profondeur d'indentation et son état. */
export interface SubjectRow {
  node: SubjectNode;
  /** Profondeur d'indentation (0 pour les racines) — calculée par le parcours. */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

/** Tous les ids de l'arbre (pour « tout déplier »). */
export function allIds(roots: readonly SubjectNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: readonly SubjectNode[]) => {
    for (const node of nodes) {
      ids.push(node.id);
      walk(node.children);
    }
  };
  walk(roots);
  return ids;
}

/**
 * Aplatit l'arbre en lignes visibles pour un rendu `@for` : une ligne par nœud, en ne
 * descendant dans les enfants d'un nœud que s'il est déplié (`expandedIds`).
 */
export function visibleRows(
  roots: readonly SubjectNode[],
  expandedIds: ReadonlySet<string>,
): SubjectRow[] {
  const rows: SubjectRow[] = [];
  const walk = (nodes: readonly SubjectNode[], depth: number) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && expandedIds.has(node.id);
      rows.push({ node, depth, hasChildren, expanded });
      if (expanded) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(roots, 0);
  return rows;
}

/**
 * Lignes visibles pour une recherche : élague l'arbre aux seules branches contenant un
 * résultat (le nœud correspondant + ses ancêtres) et les déplie toutes.
 */
export function filteredRows(roots: readonly SubjectNode[], term: string): SubjectRow[] {
  const keep = new Set<string>();
  for (const match of flattenFiltered(roots, term)) {
    for (const node of match.path) {
      keep.add(node.id);
    }
  }
  if (keep.size === 0) {
    return [];
  }
  const rows: SubjectRow[] = [];
  const walk = (nodes: readonly SubjectNode[], depth: number) => {
    for (const node of nodes) {
      if (!keep.has(node.id)) {
        continue;
      }
      const hasChildren = node.children.some((child) => keep.has(child.id));
      rows.push({ node, depth, hasChildren, expanded: hasChildren });
      walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}
