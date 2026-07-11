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
    // Route protégée (authGuard) + appels API profil : navigateur uniquement.
    path: ':lang/profile',
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
    // La racine lit la préférence de langue (localStorage) : décision côté navigateur.
    path: '',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
