/** Forme commune des environnements (ce fichier n'est jamais remplacé au build). */
export interface AppEnvironment {
  production: boolean;
  apiUrl: string;
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
