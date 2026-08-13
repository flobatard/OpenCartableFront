import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  ModuleCreatePayload,
  ModuleDetail,
  ModuleSummary,
  ModuleUpdatePayload,
} from './module.model';

/**
 * Bibliothèque de modules interactifs du cours ouvert — exemplaire du patron
 * mutable (`ResourceService`) sans flow d'upload : signal `list` source de
 * vérité refetché à chaque entrée d'onglet, mutations async qui patchent le
 * signal localement, purge à la déconnexion. Le code des modules vit en base
 * (pas de S3) : la liste est légère (`ModuleSummary`, sans code), le détail
 * (`ModuleDetail`) est servi par `getModule` avec un petit cache par id —
 * invalidé par `updateModule`/`deleteModule`/`loadList` — pour que chaque
 * embed affiché (aperçu, markdown) ne coûte qu'un GET, pas un par re-rendu.
 * Service sollicité uniquement depuis des pages `RenderMode.Client`.
 */
@Injectable({ providedIn: 'root' })
export class ModuleService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/courses`;

  readonly #list = signal<ModuleSummary[]>([]);
  /** Modules du cours chargé, du plus récent au plus ancien (sans code). */
  readonly list = this.#list.asReadonly();

  readonly #listLoading = signal(false);
  readonly listLoading = this.#listLoading.asReadonly();

  readonly #listError = signal(false);
  readonly listError = this.#listError.asReadonly();

  /** Cours dont `list` est le reflet — garde des patchs locaux. */
  #courseId: string | null = null;

  /** Détails déjà résolus (clé `courseId/moduleId`), promesses partagées. */
  #detailCache = new Map<string, Promise<ModuleDetail>>();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#list.set([]);
        this.#courseId = null;
        this.#detailCache.clear();
      }
    });
  }

  /** (Re)charge la bibliothèque — appelé à chaque entrée sur l'onglet Modules. */
  loadList(courseId: string): void {
    this.#courseId = courseId;
    this.#list.set([]);
    this.#listLoading.set(true);
    this.#listError.set(false);
    this.#detailCache.clear();
    this.#http.get<ModuleSummary[]>(`${this.#url}/${courseId}/modules`).subscribe({
      // Garde anti-stale sur TOUS les états (pas seulement la liste) : une
      // réponse tardive du cours précédent ne doit ni couper le loading du
      // cours courant ni le marquer en erreur.
      next: (modules) => {
        if (this.#courseId !== courseId) {
          return;
        }
        this.#list.set(modules);
        this.#listLoading.set(false);
      },
      error: () => {
        if (this.#courseId !== courseId) {
          return;
        }
        this.#listError.set(true);
        this.#listLoading.set(false);
      },
    });
  }

  /** Crée un module (code vide par défaut) et l'insère en tête du signal. */
  async createModule(courseId: string, payload: ModuleCreatePayload): Promise<ModuleDetail> {
    const module = await firstValueFrom(
      this.#http.post<ModuleDetail>(`${this.#url}/${courseId}/modules`, payload),
    );
    if (this.#courseId === courseId) {
      this.#list.update((modules) => [this.#summaryOf(module), ...modules]);
    }
    return module;
  }

  /**
   * Détail d'un module, code inclus. Les promesses en vol sont partagées et
   * mises en cache (une entrée par module) ; une promesse en échec est
   * retirée du cache pour permettre le retry.
   */
  getModule(courseId: string, moduleId: string): Promise<ModuleDetail> {
    const key = `${courseId}/${moduleId}`;
    const cached = this.#detailCache.get(key);
    if (cached) {
      return cached;
    }
    const promise = firstValueFrom(
      this.#http.get<ModuleDetail>(`${this.#url}/${courseId}/modules/${moduleId}`),
    ).catch((error) => {
      this.#detailCache.delete(key);
      throw error;
    });
    this.#detailCache.set(key, promise);
    return promise;
  }

  /** Renomme un module et remplace son entrée dans le signal. */
  async renameModule(courseId: string, moduleId: string, titre: string): Promise<ModuleDetail> {
    return this.updateModule(courseId, moduleId, { titre });
  }

  /**
   * Édition partielle (titre et/ou code — l'autosave de l'éditeur envoie le
   * code sans le titre). Rafraîchit le cache de détail et l'entrée de liste.
   */
  async updateModule(
    courseId: string,
    moduleId: string,
    payload: ModuleUpdatePayload,
  ): Promise<ModuleDetail> {
    const module = await firstValueFrom(
      this.#http.patch<ModuleDetail>(`${this.#url}/${courseId}/modules/${moduleId}`, payload),
    );
    this.#detailCache.set(`${courseId}/${moduleId}`, Promise.resolve(module));
    if (this.#courseId === courseId) {
      this.#list.update((modules) =>
        modules.map((m) => (m.id === moduleId ? this.#summaryOf(module) : m)),
      );
    }
    return module;
  }

  /**
   * Supprime un module et le retire du signal. Les blocs `module` pointeurs
   * sont supprimés PAR LE SERVEUR (FK CASCADE) : c'est à la page de
   * recharger le détail du cours.
   */
  async deleteModule(courseId: string, moduleId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url}/${courseId}/modules/${moduleId}`));
    this.#detailCache.delete(`${courseId}/${moduleId}`);
    if (this.#courseId === courseId) {
      this.#list.update((modules) => modules.filter((m) => m.id !== moduleId));
    }
  }

  #summaryOf(module: ModuleDetail): ModuleSummary {
    return {
      id: module.id,
      titre: module.titre,
      created_at: module.created_at,
      updated_at: module.updated_at,
    };
  }
}
