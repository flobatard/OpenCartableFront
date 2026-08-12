/**
 * Liens de partage élèves d'un cours (J2), servis par le back
 * (`/api/v1/courses/{id}/share-links`, JWT prof). Le `token` est une
 * capability URL : le front construit l'URL complète
 * `${siteUrl}/${lang}/shared/${token}` — jamais persistée, toujours dérivée.
 */
export interface ShareLink {
  id: string;
  token: string;
  /** Aide-mémoire du prof (« 6eB 2026 »), optionnel. */
  libelle: string | null;
  expires_at: string;
  /** Révoqué (soft) : listé atténué, n'ouvre plus le cours. */
  revoked: boolean;
  created_at: string;
}

/** Corps du `POST /courses/{id}/share-links`. */
export interface ShareLinkCreatePayload {
  libelle?: string | null;
}
