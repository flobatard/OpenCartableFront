import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ShareLink, ShareLinkCreatePayload } from './share-link.model';

/**
 * Liens de partage du cours ouvert — exemplaire du patron mutable
 * (`ResourceService`) côté PROF (Bearer automatique, purge à la déconnexion —
 * contrairement à `PublicCourseService`, c'est une feature de session) :
 * signal `list` source de vérité refetché à chaque entrée d'onglet, mutations
 * async qui patchent le signal localement. La révocation est soft : le lien
 * revient marqué `revoked`, il reste listé (audit, anti-confusion).
 */
@Injectable({ providedIn: 'root' })
export class ShareLinkService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/courses`;

  readonly #list = signal<ShareLink[]>([]);
  /** Liens du cours chargé, du plus récent au plus ancien, révoqués inclus. */
  readonly list = this.#list.asReadonly();

  readonly #listLoading = signal(false);
  readonly listLoading = this.#listLoading.asReadonly();

  readonly #listError = signal(false);
  readonly listError = this.#listError.asReadonly();

  /** Cours dont `list` est le reflet — garde des patchs locaux. */
  #courseId: string | null = null;

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#list.set([]);
        this.#courseId = null;
      }
    });
  }

  /** (Re)charge les liens — appelé à chaque entrée sur l'onglet Partage. */
  loadList(courseId: string): void {
    this.#courseId = courseId;
    this.#list.set([]);
    this.#listLoading.set(true);
    this.#listError.set(false);
    this.#http.get<ShareLink[]>(`${this.#url}/${courseId}/share-links`).subscribe({
      next: (links) => {
        if (this.#courseId === courseId) {
          this.#list.set(links);
        }
        this.#listLoading.set(false);
      },
      error: () => {
        this.#listError.set(true);
        this.#listLoading.set(false);
      },
    });
  }

  /** Crée un lien (expiration à 9 mois côté back) et l'insère en tête. */
  async createLink(courseId: string, label?: string): Promise<ShareLink> {
    const payload: ShareLinkCreatePayload = { label: label?.trim() || null };
    const link = await firstValueFrom(
      this.#http.post<ShareLink>(`${this.#url}/${courseId}/share-links`, payload),
    );
    if (this.#courseId === courseId) {
      this.#list.update((links) => [link, ...links]);
    }
    return link;
  }

  /** Révoque un lien (soft) et marque son entrée dans le signal. */
  async revokeLink(courseId: string, linkId: string): Promise<void> {
    await firstValueFrom(
      this.#http.delete<void>(`${this.#url}/${courseId}/share-links/${linkId}`),
    );
    if (this.#courseId === courseId) {
      this.#list.update((links) =>
        links.map((link) => (link.id === linkId ? { ...link, revoked: true } : link)),
      );
    }
  }
}
