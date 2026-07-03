import type { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  /** L'API est servie derrière le même reverse proxy nginx que le front. */
  apiUrl: '/api',
  oidc: {
    // Valeurs à adapter au déploiement (instance Zitadel de production).
    issuer: 'https://auth.example.org',
    clientId: 'opencartable',
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/',
    scope: 'openid profile email offline_access',
    requireHttps: true,
    showDebugInformation: false,
  },
};
