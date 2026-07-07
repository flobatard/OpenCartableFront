import type { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  /** L'API est servie derrière le même reverse proxy nginx que le front. */
  apiUrl: '/api',
  // À adapter au déploiement : domaine de production réel (liens SEO absolus).
  siteUrl: 'https://cartable.example.org',
  oidc: {
    // Valeurs à adapter au déploiement (instance Zitadel de production).
    issuer: 'https://auth.example.org',
    clientId: 'opencartable',
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/',
    scope: 'openid profile email offline_access zitadel:iam:org:id:380648680241233922',
    requireHttps: true,
    showDebugInformation: false,
  },
};
