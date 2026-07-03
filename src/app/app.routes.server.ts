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
    // La racine lit la préférence de langue (localStorage) : décision côté navigateur.
    path: '',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
