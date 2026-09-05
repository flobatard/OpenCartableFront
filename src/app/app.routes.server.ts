import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Modes de rendu par chemin. Trois cas : la home est prerendue au build, la
 * racine et tout ce qui touche `window`/`localStorage`, Monaco, DOMPurify ou
 * un guard prof est **explicitement** en `RenderMode.Client`, le reste tombe
 * dans le catch-all `Server`. Toute nouvelle route doit choisir son mode —
 * DOMPurify sans `window` renverrait du HTML NON filtré, et `authGuard`
 * renvoie `false` au serveur (une route protégée n'est jamais rendue
 * authentifiée au SSR, donc jamais prerendable).
 */

const clientOnly = (paths: readonly string[]): ServerRoute[] =>
  paths.map((path) => ({ path, renderMode: RenderMode.Client }));

/**
 * Sous-arbre d'un cours élève (miroir de `PUBLIC_COURSE_CHILDREN` dans
 * `app.routes.ts`, gardé par `app.routes.spec.ts`) : la coquille, une route
 * par onglet, le bloc seul, les pages pleines et la redirection de l'ancienne
 * page d'exercice — markdown-view, Mermaid, iframe sandbox et localStorage
 * sont browser-only.
 */
const publicCourseRoutes = (base: string): ServerRoute[] =>
  clientOnly([
    base,
    `${base}/blocks/:blockId`,
    `${base}/resources`,
    `${base}/modules`,
    `${base}/content`,
    `${base}/exercises/:blockId`,
    `${base}/modules/:moduleId`,
    `${base}/resources/:resourceId`,
  ]);

export const serverRoutes: ServerRoute[] = [
  {
    // Prerendu au build, une page distincte par langue : /fr/home et /en/home.
    path: ':lang/home',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => [{ lang: 'fr' }, { lang: 'en' }],
  },

  // Le callback OIDC manipule l'URL et le storage ; la racine lit la
  // préférence de langue (localStorage).
  ...clientOnly(['auth/callback', '']),

  // Documentation des langages markdown : Monaco (playgrounds) + markdown-view ;
  // l'entrée sans slug est une redirection décidée côté navigateur.
  ...clientOnly([':lang/markdown-language/docs', ':lang/markdown-language/docs/:slug']),

  // Pages élèves : lien de partage, cours public, catalogue d'un prof.
  ...publicCourseRoutes(':lang/shared/:token'),
  ...publicCourseRoutes(':lang/p/courses/:courseId'),
  ...clientOnly([':lang/p/:teacherId']),

  // Recherche publique : Client comme toutes les pages élèves (aucune route
  // SSR n'appelle l'API), l'état vit dans les query params.
  ...clientOnly([':lang/search']),

  // Espace prof (routes protégées, appels API) et éditeurs Monaco.
  ...clientOnly([
    ':lang/subjects',
    ':lang/onboarding',
    ':lang/profile',
    ':lang/settings',
    ':lang/settings/profile',
    ':lang/settings/ai',
    ':lang/courses',
    ':lang/courses/new',
    ':lang/courses/:id',
    ':lang/courses/:id/blocks/:blockId',
    ':lang/courses/:id/modules/:moduleId',
    ':lang/courses/:id/resources/:resourceId',
  ]),

  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
