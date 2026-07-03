import type { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  siteUrl: 'http://localhost:4200',
  oidc: {
    issuer: 'http://localhost:8080',
    clientId: 'opencartable-local',
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/',
    scope: 'openid profile email offline_access',
    requireHttps: 'remoteOnly',
    showDebugInformation: true,
  },
};
