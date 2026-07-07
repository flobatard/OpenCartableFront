import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EducationLevelNode } from './education-level.model';

/**
 * Accès à la classification des niveaux d'étude (`GET /api/v1/education-levels/tree`).
 *
 * Même patron que `SubjectService` : l'arbre (petit, ~22 nœuds) est récupéré en
 * **un seul appel** puis mis en cache — `shareReplay(1)` rejoue la réponse à tous
 * les abonnés, et les signaux exposent l'état pour les vues (arbre + chargement +
 * erreur). Le Bearer Zitadel est attaché automatiquement par l'intercepteur
 * d'`angular-oauth2-oidc` (URL sous `environment.apiUrl`).
 */
@Injectable({ providedIn: 'root' })
export class EducationLevelService {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/v1/education-levels/tree`;

  #cache$: Observable<EducationLevelNode[]> | undefined;

  readonly #tree = signal<EducationLevelNode[]>([]);
  /** Arbre chargé (vide tant que le fetch n'a pas abouti). */
  readonly tree = this.#tree.asReadonly();

  readonly #loading = signal(false);
  readonly loading = this.#loading.asReadonly();

  readonly #error = signal(false);
  readonly error = this.#error.asReadonly();

  /** Observable caché : un seul appel réseau, rejoué à chaud pour tous les consommateurs. */
  tree$(): Observable<EducationLevelNode[]> {
    this.#cache$ ??= this.#http
      .get<EducationLevelNode[]>(this.#url)
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

  /** Vide le cache et recharge (bouton « Réessayer » après une erreur réseau). */
  reload(): void {
    this.#cache$ = undefined;
    this.load();
  }
}
