import type { AppEnvironment } from './environment.model';

/**
 * Environnement de PREPROD — gravé dans le bundle par
 * `ng build --configuration preprod` (fileReplacements, cf. angular.json).
 *
 * ⚠️ VALEURS PLACEHOLDER — à renseigner avant le premier déploiement.
 */
export const environment: AppEnvironment = {
  production: true,
  /** L'API est servie derrière le même reverse proxy nginx que le front. */
  apiUrl: '/api',
  // Domaine public de preprod, sans slash final (liens SEO absolus).
  siteUrl: 'https://<placeholder_preprod_host>',
  oidc: {
    // Instance Zitadel de preprod — l'issuer doit correspondre à OIDC_ISSUER
    // de OpenCartableBack/config/preprod.yaml.
    issuer: 'https://<placeholder_zitadel_host>',
    // Client id de la SPA dans Zitadel (à ne pas confondre avec l'ID de projet
    // attendu par OIDC_AUDIENCE côté API).
    clientId: '<placeholder_oidc_client_id>',
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/',
    scope:
      'openid profile email offline_access urn:zitadel:iam:org:id:<placeholder_zitadel_org_id>',
    requireHttps: true,
    showDebugInformation: false,
  },
};
