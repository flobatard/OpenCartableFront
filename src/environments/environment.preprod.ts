import type { AppEnvironment } from './environment.model';

/**
 * Environnement de PREPROD — gravé dans le bundle par
 * `ng build --configuration preprod` (fileReplacements, cf. angular.json).
 *
 * Front et API sont sur DEUX origines distinctes (preprod.opencartable.com /
 * api.preprod.opencartable.com) : `apiUrl` est donc absolu, et l'API doit
 * autoriser l'origine du front dans CORS_ORIGINS (OpenCartableBack/config/preprod.yaml).
 */
export const environment: AppEnvironment = {
  production: true,
  /** Origine dédiée de l'API, `/api` inclus (cf. CLAUDE.md racine, contrat n°3). */
  apiUrl: 'https://api.preprod.opencartable.com/api',
  // Domaine public de preprod, sans slash final (liens SEO absolus).
  siteUrl: 'https://preprod.opencartable.com',
  oidc: {
    // Instance Zitadel de preprod — l'issuer doit correspondre à OIDC_ISSUER
    // de OpenCartableBack/config/preprod.yaml.
    issuer: 'https://zitadel.home.fbatard.fr',
    // Client id de la SPA dans Zitadel (à ne pas confondre avec l'ID de projet
    // attendu par OIDC_AUDIENCE côté API). Client partagé avec le dev :
    // https://preprod.opencartable.com/auth/callback doit figurer dans ses
    // redirect URIs (et l'origine dans ses post-logout redirect URIs).
    clientId: '389608873998221314',
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/',
    scope: 'openid profile email offline_access urn:zitadel:iam:org:id:380648680241233922',
    requireHttps: true,
    showDebugInformation: false,
  },
};
