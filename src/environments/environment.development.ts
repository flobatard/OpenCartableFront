import type { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  siteUrl: 'http://localhost:4200',
  oidc: {
    issuer: 'https://zitadel.home.fbatard.fr',
    clientId: '380648830682595330',
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '',
    scope: 'openid profile email offline_access urn:zitadel:iam:org:id:380648680241233922',
    requireHttps: 'remoteOnly',
    showDebugInformation: true,
  },
};
