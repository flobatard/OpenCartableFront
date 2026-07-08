import { CourseBlock } from '../../../core/courses/course.model';

/** Longueur maximale de l'extrait d'un bloc dans la liste. */
const EXCERPT_MAX = 80;

/**
 * Extrait d'une ligne du contenu d'un bloc (aperçu de la liste, en attendant
 * les éditeurs dédiés) : texte → markdown, exercice → énoncé, lien → titre ou
 * URL. Chaîne vide si le bloc n'a pas encore de contenu (repli i18n côté vue).
 */
export function blockExcerpt(block: CourseBlock): string {
  const text = rawExcerpt(block).replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text;
}

function rawExcerpt(block: CourseBlock): string {
  switch (block.type) {
    case 'texte':
      return asString(block.content['markdown']);
    case 'exercice':
      return asString(block.content['enonce']);
    case 'lien':
      return asString(block.content['titre']) || asString(block.content['url']);
    default:
      return '';
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Déplace `id` de `delta` positions dans `ids` et retourne un nouveau tableau.
 * No-op (copie inchangée) si l'id est inconnu ou si le déplacement sort des
 * bornes — les boutons des extrémités sont désactivés, ceinture et bretelles.
 */
export function moveId(ids: readonly string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  const next = [...ids];
  if (from === -1 || to < 0 || to >= ids.length) {
    return next;
  }
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/**
 * Déplace l'élément d'index `from` vers `to` et retourne un nouveau tableau.
 * No-op (copie inchangée) si l'un des index sort des bornes. Variante
 * index→index de `moveId`, pour le glisser-déposer (le drop CDK fournit
 * `previousIndex`/`currentIndex`).
 */
export function moveIdTo(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids];
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
