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
