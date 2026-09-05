import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EducationLevelNode } from './education-level.model';

/**
 * Arbre des niveaux d'étude en lecture publique
 * (`GET /api/v1/public/education-levels/tree`) — facettes de la recherche.
 *
 * Service PARALLÈLE à `EducationLevelService` pour les mêmes raisons que
 * `PublicSubjectService` (cache singleton, Bearer décidé par l'URL) — voir
 * son commentaire de tête.
 */
@Injectable({ providedIn: 'root' })
export class PublicEducationLevelService {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/v1/public/education-levels/tree`;

  #cache$: Observable<EducationLevelNode[]> | undefined;

  readonly #tree = signal<EducationLevelNode[]>([]);
  readonly tree = this.#tree.asReadonly();

  readonly #loading = signal(false);
  readonly loading = this.#loading.asReadonly();

  readonly #error = signal(false);
  readonly error = this.#error.asReadonly();

  tree$(): Observable<EducationLevelNode[]> {
    this.#cache$ ??= this.#http
      .get<EducationLevelNode[]>(this.#url)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.#cache$;
  }

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

  reload(): void {
    this.#cache$ = undefined;
    this.load();
  }
}
