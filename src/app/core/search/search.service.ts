import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import {
  SearchCourseResult,
  SearchPage,
  SearchQuery,
  SearchTeacherResult,
} from './search.model';

/** Taille de page unique de la recherche (bornée à 50 par le back). */
export const SEARCH_PAGE_SIZE = 20;

/**
 * Recherche publique — endpoints `/api/v1/public/search/*`.
 *
 * Pendant ANONYME (comme `PublicCourseService`) : n'injecte pas `AuthService`,
 * ne purge rien à la déconnexion, et le Bearer est exclu de `/v1/public/` par
 * la `customUrlValidation` d'`app.config.ts` — même un prof connecté cherche
 * en anonyme. Un compteur de requête (stale-guard) garantit que seule la
 * dernière réponse écrit les signaux (frappe débouncée + navigation rapide).
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  readonly #http = inject(HttpClient);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #url = `${environment.apiUrl}/v1/public/search`;

  readonly #coursesPage = signal<SearchPage<SearchCourseResult> | null>(null);
  /** Dernière page de cours reçue (`null` tant qu'aucune recherche n'a abouti). */
  readonly coursesPage = this.#coursesPage.asReadonly();

  readonly #coursesLoading = signal(false);
  readonly coursesLoading = this.#coursesLoading.asReadonly();

  readonly #coursesError = signal(false);
  readonly coursesError = this.#coursesError.asReadonly();

  readonly #teachersPage = signal<SearchPage<SearchTeacherResult> | null>(null);
  readonly teachersPage = this.#teachersPage.asReadonly();

  readonly #teachersLoading = signal(false);
  readonly teachersLoading = this.#teachersLoading.asReadonly();

  readonly #teachersError = signal(false);
  readonly teachersError = this.#teachersError.asReadonly();

  #coursesRequestId = 0;
  #teachersRequestId = 0;

  /** Lance (ou relance) une recherche de cours ; la dernière émise gagne. */
  searchCourses(query: SearchQuery): void {
    if (!this.#isBrowser) {
      return;
    }
    const requestId = ++this.#coursesRequestId;
    this.#coursesError.set(false);
    this.#coursesLoading.set(true);
    this.#http
      .get<SearchPage<SearchCourseResult>>(`${this.#url}/courses`, {
        params: this.#params(query),
      })
      .subscribe({
        next: (page) => {
          if (requestId !== this.#coursesRequestId) {
            return;
          }
          this.#coursesPage.set(page);
          this.#coursesLoading.set(false);
        },
        error: () => {
          if (requestId !== this.#coursesRequestId) {
            return;
          }
          this.#coursesError.set(true);
          this.#coursesLoading.set(false);
        },
      });
  }

  /** Lance (ou relance) une recherche de professeurs ; la dernière émise gagne. */
  searchTeachers(query: SearchQuery): void {
    if (!this.#isBrowser) {
      return;
    }
    const requestId = ++this.#teachersRequestId;
    this.#teachersError.set(false);
    this.#teachersLoading.set(true);
    this.#http
      .get<SearchPage<SearchTeacherResult>>(`${this.#url}/teachers`, {
        params: this.#params(query),
      })
      .subscribe({
        next: (page) => {
          if (requestId !== this.#teachersRequestId) {
            return;
          }
          this.#teachersPage.set(page);
          this.#teachersLoading.set(false);
        },
        error: () => {
          if (requestId !== this.#teachersRequestId) {
            return;
          }
          this.#teachersError.set(true);
          this.#teachersLoading.set(false);
        },
      });
  }

  /** Seuls les paramètres non vides voyagent (URL et cache côté back propres). */
  #params(query: SearchQuery): HttpParams {
    let params = new HttpParams()
      .set('limit', SEARCH_PAGE_SIZE)
      .set('offset', (Math.max(1, query.page) - 1) * SEARCH_PAGE_SIZE);
    const q = query.q.trim();
    if (q !== '') {
      params = params.set('q', q);
    }
    if (query.subjectId) {
      params = params.set('subject_id', query.subjectId);
    }
    if (query.educationLevelId) {
      params = params.set('education_level_id', query.educationLevelId);
    }
    return params;
  }
}
