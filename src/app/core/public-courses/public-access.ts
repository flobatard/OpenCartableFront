import { ActivatedRoute } from '@angular/router';
import { PublicAccess } from './public-course.model';

/**
 * Régime d'accès élève d'une route publique, lu en snapshot (convention
 * repo) : le mode vient de `data.access` (`'token'` sous `shared/:token`,
 * `'public'` sous `p/courses/:courseId` — posé dans `app.routes.ts`), la clé
 * du param correspondant. `null` si la route est mal câblée (défensif).
 */
export function publicAccessFromRoute(route: ActivatedRoute): PublicAccess | null {
  const mode = route.snapshot.data['access'] as PublicAccess['mode'] | undefined;
  const key =
    mode === 'token'
      ? route.snapshot.paramMap.get('token')
      : mode === 'public'
        ? route.snapshot.paramMap.get('courseId')
        : null;
  return mode !== undefined && key !== null && key !== '' ? { mode, key } : null;
}

/** Segments routerLink de la racine du cours dans le régime d'accès donné. */
export function publicCourseSegments(access: PublicAccess): string[] {
  return access.mode === 'token' ? ['shared', access.key] : ['p', 'courses', access.key];
}

/**
 * Commandes routerLink **absolues** d'une sous-page du cours élève (onglet,
 * bloc seul, module dédié) — `publicCourseLink(lang, access, 'blocks', id)`.
 *
 * Absolues et non relatives : les sous-pages sont montées à des profondeurs
 * différentes (enfants de la coquille pour les onglets, frères pour les pages
 * pleines), un lien relatif n'y voudrait pas dire la même chose. Sans accès
 * connu (détail pas encore chargé), `[]` — le lien est inerte.
 */
export function publicCourseLink(
  lang: string,
  access: PublicAccess | null,
  ...rest: string[]
): string[] {
  return access === null ? [] : ['/', lang, ...publicCourseSegments(access), ...rest];
}
