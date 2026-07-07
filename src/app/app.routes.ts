import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { langGuard } from './core/i18n/lang.guard';
import { rootLangRedirect } from './core/i18n/root-redirect';
import { onboardingGuard } from './core/users/onboarding.guard';

export const routes: Routes = [
  {
    // Redirige vers /<lang>/home selon la préférence stockée puis la langue du navigateur.
    path: '',
    pathMatch: 'full',
    redirectTo: () => rootLangRedirect(),
  },
  {
    // Le callback OIDC reste hors du préfixe de langue (URI de redirection = /auth/callback).
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/auth-callback').then((m) => m.AuthCallback),
  },
  {
    path: ':lang',
    canActivate: [langGuard],
    // Réexécute le guard (donc réactive la langue) au changement de segment fr↔en.
    runGuardsAndResolvers: 'pathParamsChange',
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        // Réservé au prof authentifié ; jamais rendu authentifié au serveur (cf. authGuard).
        path: 'subjects',
        canActivate: [authGuard, onboardingGuard],
        loadComponent: () => import('./features/subjects/subjects').then((m) => m.Subjects),
      },
      {
        // Onboarding bloquant post-login. PAS d'onboardingGuard ici (boucle) :
        // le composant redirige lui-même si le profil est déjà complet.
        path: 'onboarding',
        canActivate: [authGuard],
        loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'fr/home',
  },
];
