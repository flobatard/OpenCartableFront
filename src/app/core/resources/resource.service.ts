import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  CourseResource,
  ResourceCreatePayload,
  ResourceDownload,
  ResourcePresign,
} from './resource.model';
import { resourceTypeFromMime } from './resource.utils';

/**
 * Phases de l'upload en cours (un seul à la fois, séquentiel) : `progress`
 * n'est significatif que pendant `uploading` (0–100, octets envoyés à S3).
 */
export interface UploadState {
  phase: 'idle' | 'presigning' | 'uploading' | 'confirming' | 'error';
  progress: number;
}

/**
 * Bibliothèque de ressources du cours ouvert — variante MUTABLE du patron
 * (`CourseService`) : signal `list` source de vérité refetché à chaque
 * entrée d'onglet, mutations async qui patchent le signal localement, purge
 * à la déconnexion.
 *
 * L'upload est en trois temps (Descriptions.md §5.2) : POST presign (API,
 * Bearer automatique), **PUT direct navigateur→S3** sur l'URL présignée —
 * hors `environment.apiUrl`, donc l'intercepteur OIDC n'y attache PAS de
 * Bearer (`resourceServer.allowedUrls`), c'est voulu ; le `Content-Type`
 * envoyé doit être STRICTEMENT le mime déclaré au presign (figé dans la
 * signature S3) —, puis POST confirm (API). Service sollicité uniquement
 * depuis des pages `RenderMode.Client`, côté navigateur.
 */
@Injectable({ providedIn: 'root' })
export class ResourceService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/courses`;

  readonly #list = signal<CourseResource[]>([]);
  /** Ressources du cours chargé, de la plus récente à la plus ancienne. */
  readonly list = this.#list.asReadonly();

  readonly #listLoading = signal(false);
  readonly listLoading = this.#listLoading.asReadonly();

  readonly #listError = signal(false);
  readonly listError = this.#listError.asReadonly();

  readonly #uploadState = signal<UploadState>({ phase: 'idle', progress: 0 });
  readonly uploadState = this.#uploadState.asReadonly();

  /** Cours dont `list` est le reflet — garde des patchs locaux. */
  #courseId: string | null = null;

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#list.set([]);
        this.#courseId = null;
        this.#uploadState.set({ phase: 'idle', progress: 0 });
      }
    });
  }

  /** (Re)charge la bibliothèque — appelé à chaque entrée sur l'onglet Ressources. */
  loadList(courseId: string): void {
    this.#courseId = courseId;
    this.#list.set([]);
    this.#listLoading.set(true);
    this.#listError.set(false);
    this.#http.get<CourseResource[]>(`${this.#url}/${courseId}/resources`).subscribe({
      next: (resources) => {
        if (this.#courseId === courseId) {
          this.#list.set(resources);
        }
        this.#listLoading.set(false);
      },
      error: () => {
        this.#listError.set(true);
        this.#listLoading.set(false);
      },
    });
  }

  /**
   * Upload complet d'un fichier : presign → PUT S3 (progression) → confirm.
   * Insère la ressource confirmée en tête du signal `list` et retourne son
   * état final. Sur échec, `uploadState` passe à `error` (le composant
   * affiche et permet de retenter) et la promesse rejette.
   */
  async upload(courseId: string, file: File): Promise<CourseResource> {
    const mime = file.type || 'application/octet-stream';
    this.#uploadState.set({ phase: 'presigning', progress: 0 });
    try {
      const payload: ResourceCreatePayload = {
        nom_original: file.name,
        mime,
        taille: file.size,
        type: resourceTypeFromMime(mime),
      };
      const presign = await firstValueFrom(
        this.#http.post<ResourcePresign>(`${this.#url}/${courseId}/resources`, payload),
      );

      this.#uploadState.set({ phase: 'uploading', progress: 0 });
      await this.#putToS3(presign.upload_url, file, mime);

      this.#uploadState.set({ phase: 'confirming', progress: 100 });
      const resource = await firstValueFrom(
        this.#http.post<CourseResource>(
          `${this.#url}/${courseId}/resources/${presign.resource_id}/confirm`,
          null,
        ),
      );

      if (this.#courseId === courseId) {
        this.#list.update((resources) => [resource, ...resources]);
      }
      this.#uploadState.set({ phase: 'idle', progress: 0 });
      return resource;
    } catch (error) {
      this.#uploadState.set({ phase: 'error', progress: 0 });
      throw error;
    }
  }

  /** Renomme une ressource (nom affiché seulement) et remplace son entrée. */
  async rename(courseId: string, resourceId: string, nomOriginal: string): Promise<CourseResource> {
    const resource = await firstValueFrom(
      this.#http.patch<CourseResource>(`${this.#url}/${courseId}/resources/${resourceId}`, {
        nom_original: nomOriginal,
      }),
    );
    if (this.#courseId === courseId) {
      this.#list.update((resources) => resources.map((r) => (r.id === resourceId ? resource : r)));
    }
    return resource;
  }

  /**
   * Supprime une ressource (et son objet S3 côté back) et la retire du
   * signal. Les blocs `document` pointeurs sont supprimés PAR LE SERVEUR
   * (FK CASCADE) : c'est à la page de recharger le détail du cours.
   */
  async deleteResource(courseId: string, resourceId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url}/${courseId}/resources/${resourceId}`));
    if (this.#courseId === courseId) {
      this.#list.update((resources) => resources.filter((r) => r.id !== resourceId));
    }
  }

  /** URL présignée de téléchargement (TTL court) — l'ouverture reste à l'appelant. */
  async getDownloadUrl(courseId: string, resourceId: string): Promise<string> {
    const download = await firstValueFrom(
      this.#http.get<ResourceDownload>(
        `${this.#url}/${courseId}/resources/${resourceId}/download`,
      ),
    );
    return download.download_url;
  }

  /** PUT du binaire sur l'URL présignée, progression relayée dans `uploadState`. */
  #putToS3(uploadUrl: string, file: File, mime: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#http
        .put(uploadUrl, file, {
          headers: new HttpHeaders({ 'Content-Type': mime }),
          reportProgress: true,
          observe: 'events',
          responseType: 'text',
        })
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress && event.total) {
              this.#uploadState.set({
                phase: 'uploading',
                progress: Math.round((event.loaded / event.total) * 100),
              });
            }
          },
          error: reject,
          complete: () => resolve(),
        });
    });
  }
}
