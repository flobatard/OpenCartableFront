import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Le callback OIDC manipule l'URL et le storage : navigateur uniquement.
    path: 'auth/callback',
    renderMode: RenderMode.Client,
  },
  {
    // Prerendu au build, une page distincte par langue : /fr/home et /en/home.
    path: ':lang/home',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => [{ lang: 'fr' }, { lang: 'en' }],
  },
  {
    // Simple redirection vers la première page de doc : décision côté navigateur.
    path: ':lang/markdown-language/docs',
    renderMode: RenderMode.Client,
  },
  {
    // Monaco (playgrounds) + markdown-view (DOMPurify/mermaid/extensions) :
    // navigateur uniquement, jamais rendu au serveur.
    path: ':lang/markdown-language/docs/:slug',
    renderMode: RenderMode.Client,
  },
  {
    // Pages élèves (J2) : markdown-view/DOMPurify/Mermaid/iframe/localStorage
    // sont browser-only — et DOMPurify sans `window` retournerait le HTML NON
    // filtré. Explicites, pour ne jamais retomber dans le catch-all Server.
    path: ':lang/shared/:token',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/shared/:token/exercises/:blockId',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/shared/:token/resources/:resourceId',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/p/:profId',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/p/courses/:courseId',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/p/courses/:courseId/exercises/:blockId',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/p/courses/:courseId/resources/:resourceId',
    renderMode: RenderMode.Client,
  },
  {
    // Recherche publique (J3) : Client comme toutes les pages élèves — aucun
    // précédent de route SSR appelant l'API (couplage d'infra jamais acté,
    // contrainte Pi), et l'état vit dans les query params.
    path: ':lang/search',
    renderMode: RenderMode.Client,
  },
  {
    // Route protégée (authGuard renvoie false au serveur) : rendu navigateur uniquement,
    // jamais prerendered — aucun appel API à l'IdP/back au build.
    path: ':lang/subjects',
    renderMode: RenderMode.Client,
  },
  {
    // Route protégée (authGuard) + appels API profil : navigateur uniquement.
    path: ':lang/onboarding',
    renderMode: RenderMode.Client,
  },
  {
    // Ancienne URL du profil : simple redirection, décidée côté navigateur.
    path: ':lang/profile',
    renderMode: RenderMode.Client,
  },
  {
    // Hub « Paramètres » et ses sous-pages : routes protégées (authGuard) +
    // appels API profil/credential — navigateur uniquement. Explicites pour
    // ne jamais retomber dans le catch-all Server.
    path: ':lang/settings',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/settings/profile',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/settings/ai',
    renderMode: RenderMode.Client,
  },
  {
    // Routes protégées (authGuard) + appels API cours : navigateur uniquement.
    path: ':lang/courses',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/courses/new',
    renderMode: RenderMode.Client,
  },
  {
    path: ':lang/courses/:id',
    renderMode: RenderMode.Client,
  },
  {
    // Impératif : le wrapper monaco (ngx-monaco-editor) touche window/document
    // sans guard SSR — cette route ne doit jamais être rendue au serveur.
    path: ':lang/courses/:id/blocks/:blockId',
    renderMode: RenderMode.Client,
  },
  {
    // Impératif : Monaco (3 instances) + iframe sandbox de la preview —
    // navigateur uniquement, jamais rendu au serveur.
    path: ':lang/courses/:id/modules/:moduleId',
    renderMode: RenderMode.Client,
  },
  {
    // Route protégée (authGuard) qui présigne puis redirige via window.location :
    // navigateur uniquement.
    path: ':lang/courses/:id/resources/:resourceId',
    renderMode: RenderMode.Client,
  },
  {
    // La racine lit la préférence de langue (localStorage) : décision côté navigateur.
    path: '',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
