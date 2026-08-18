import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SubjectNode } from './subject.model';

/**
 * Arbre des matières en lecture publique (`GET /api/v1/public/subjects/tree`,
 * J3) — alimente les facettes de la page de recherche anonyme.
 *
 * Service PARALLÈLE à `SubjectService`, pas une source paramétrable : le cache
 * `shareReplay` est un singleton par service (une double source servirait
 * l'arbre « public » à une page prof selon le premier appelant), et c'est
 * l'URL qui décide du Bearer — `/v1/public/` est exclu de l'attachement par la
 * `customUrlValidation` d'`app.config.ts` (motif `PublicCourseService` vs
 * `CourseService`). Les données sont identiques à la route JWT (délégation
 * pure côté back) : mêmes modèles, mêmes helpers `subject.utils.ts`.
 */
@Injectable({ providedIn: 'root' })
export class PublicSubjectService {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/v1/public/subjects/tree`;

  #cache$: Observable<SubjectNode[]> | undefined;

  readonly #tree = signal<SubjectNode[]>([]);
  /** Arbre chargé (vide tant que le fetch n'a pas abouti). */
  readonly tree = this.#tree.asReadonly();

  readonly #loading = signal(false);
  readonly loading = this.#loading.asReadonly();

  readonly #error = signal(false);
  readonly error = this.#error.asReadonly();

  /** Observable caché : un seul appel réseau, rejoué à chaud. */
  tree$(): Observable<SubjectNode[]> {
    this.#cache$ ??= this.#http
      .get<SubjectNode[]>(this.#url)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.#cache$;
  }

  /** Charge l'arbre dans les signaux (idempotent : réutilise le cache). */
  load(): void {
    if (this.#loading()) {
      return;
    }
    this.#loading.set(true);
    this.#error.set(false);
    this.tree$().subscribe({
      next: (tree) => {
        this.#tree.set(tree);
        this.#loading.set(false);
      },
      error: () => {
        this.#error.set(true);
        this.#loading.set(false);
      },
    });
  }

  /** Vide le cache et recharge (bouton « Réessayer »). */
  reload(): void {
    this.#cache$ = undefined;
    this.load();
  }
}
