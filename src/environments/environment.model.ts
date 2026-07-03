/** Forme commune des environnements (ce fichier n'est jamais remplacé au build). */
export interface AppEnvironment {
  production: boolean;
  apiUrl: string;
  /** Origine absolue du site (sans slash final) : liens SEO canonical/hreflang/og:url. */
  siteUrl: string;
  oidc: {
    issuer: string;
    clientId: string;
    /** Chemins relatifs : l'origine est résolue au runtime navigateur (location.origin). */
    redirectPath: string;
    postLogoutRedirectPath: string;
    scope: string;
    /** 'remoteOnly' autorise http:// pour localhost uniquement. */
    requireHttps: boolean | 'remoteOnly';
    showDebugInformation: boolean;
  };
}
