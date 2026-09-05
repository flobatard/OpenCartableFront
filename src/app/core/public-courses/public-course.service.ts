import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppLang } from '../i18n/language.service';
import { ModuleDetail } from '../modules/module.model';
import {
  PublicAccess,
  PublicCourseDetail,
  PublicProfessor,
} from './public-course.model';

/**
 * Accès élève aux cours partagés — endpoints `/api/v1/public/*`.
 *
 * Ce service est le pendant ANONYME de `CourseService` : il n'injecte pas
 * `AuthService` (les pages élèves ne parlent jamais à Zitadel) et ne purge
 * rien à la déconnexion — son état ne dépend d'aucune session. Le Bearer est
 * par ailleurs exclu de `/v1/public/` par la `customUrlValidation` de
 * `app.config.ts` : même un prof connecté consulte ces pages en anonyme.
 *
 * L'accès (`PublicAccess`) est mémorisé au chargement du détail : les
 * sous-requêtes (presign ressource, code module) rejouent le même token en
 * query param, et `contentUrl` reconstruit les URL front stables du même
 * régime (liens des PDF exportés côté élève).
 */
@Injectable({ providedIn: 'root' })
export class PublicCourseService {
  readonly #http = inject(HttpClient);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #url = `${environment.apiUrl}/v1/public`;

  readonly #detail = signal<PublicCourseDetail | null>(null);
  /** Détail filtré du cours consulté (source de vérité de la vue élève). */
  readonly detail = this.#detail.asReadonly();

  readonly #detailLoading = signal(false);
  readonly detailLoading = this.#detailLoading.asReadonly();

  /** Erreur générique unique : le back répond 404 quel que soit le motif. */
  readonly #detailError = signal(false);
  readonly detailError = this.#detailError.asReadonly();

  readonly #catalog = signal<PublicProfessor | null>(null);
  readonly catalog = this.#catalog.asReadonly();

  readonly #catalogLoading = signal(false);
  readonly catalogLoading = this.#catalogLoading.asReadonly();

  readonly #catalogError = signal(false);
  readonly catalogError = this.#catalogError.asReadonly();

  /**
   * Accès dont `detail` est le reflet — garde des sous-requêtes. Exposé en
   * signal : les sous-pages du cours (onglets, bloc seul, module dédié) en
   * dérivent leurs liens sans relire `data.access` de la route. Elles ne
   * peuvent pas le faire elles-mêmes — leur route parente porte un
   * composant (la coquille), ce qui coupe l'héritage de `data` par défaut.
   */
  readonly #accessSignal = signal<PublicAccess | null>(null);
  readonly access = this.#accessSignal.asReadonly();
  /** Détail en vol, partagé (la route ressource et la page cours le réutilisent). */
  #inflight: Promise<PublicCourseDetail | null> | null = null;

  /** Code des modules déjà résolus (promesses partagées, comme `ModuleService`). */
  #moduleCache = new Map<string, Promise<ModuleDetail>>();

  /**
   * (Re)charge le détail public du cours désigné par `access`. Idempotent sur
   * le même accès : un chargement en vol ou déjà abouti est réutilisé (la
   * route de redirection de ressource et la page cours partagent l'appel).
   * Ne rejette jamais : `null` en cas d'échec, l'état d'erreur vit dans les
   * signaux (`detailError`) — le back répond 404 quel que soit le motif.
   */
  loadCourse(access: PublicAccess): Promise<PublicCourseDetail | null> {
    if (!this.#isBrowser) {
      return Promise.resolve(null);
    }
    if (this.#sameAccess(access)) {
      if (this.#inflight) {
        return this.#inflight;
      }
      const current = this.#detail();
      if (current !== null) {
        return Promise.resolve(current);
      }
    }
    this.#accessSignal.set(access);
    this.#detail.set(null);
    this.#detailError.set(false);
    this.#detailLoading.set(true);
    this.#moduleCache.clear();
    const url =
      access.mode === 'token'
        ? `${this.#url}/shared/${access.key}`
        : `${this.#url}/courses/${access.key}`;
    const promise = firstValueFrom(this.#http.get<PublicCourseDetail>(url)).then(
      (detail) => {
        if (this.#sameAccess(access)) {
          this.#detail.set(detail);
          this.#detailLoading.set(false);
        }
        return detail;
      },
      () => {
        if (this.#sameAccess(access)) {
          this.#detailError.set(true);
          this.#detailLoading.set(false);
          this.#inflight = null;
        }
        return null;
      },
    );
    this.#inflight = promise;
    return promise;
  }

  /** URL présignée fraîche d'une ressource du cours consulté (TTL court). */
  async getDownloadUrl(
    courseId: string,
    resourceId: string,
    disposition: 'attachment' | 'inline' = 'attachment',
  ): Promise<string> {
    const download = await firstValueFrom(
      this.#http.get<{ download_url: string; expires_in: number }>(
        `${this.#url}/courses/${courseId}/resources/${resourceId}/download`,
        { params: this.#params(disposition === 'inline' ? { disposition } : {}) },
      ),
    );
    return download.download_url;
  }

  /** Code d'un module du cours consulté (cache par id, un GET par module). */
  getModule(courseId: string, moduleId: string): Promise<ModuleDetail> {
    const key = `${courseId}/${moduleId}`;
    const cached = this.#moduleCache.get(key);
    if (cached) {
      return cached;
    }
    const promise = firstValueFrom(
      this.#http.get<ModuleDetail>(`${this.#url}/courses/${courseId}/modules/${moduleId}`, {
        params: this.#params({}),
      }),
    ).catch((error: unknown) => {
      this.#moduleCache.delete(key);
      throw error;
    });
    this.#moduleCache.set(key, promise);
    return promise;
  }

  /** (Re)charge le catalogue public d'un prof. */
  loadCatalog(teacherId: string): void {
    if (!this.#isBrowser) {
      return;
    }
    this.#catalog.set(null);
    this.#catalogError.set(false);
    this.#catalogLoading.set(true);
    this.#http.get<PublicProfessor>(`${this.#url}/professors/${teacherId}/courses`).subscribe({
      next: (catalog) => {
        this.#catalog.set(catalog);
        this.#catalogLoading.set(false);
      },
      error: () => {
        this.#catalogError.set(true);
        this.#catalogLoading.set(false);
      },
    });
  }

  /**
   * URL front stable d'une ressource dans le régime d'accès courant — le
   * pendant élève de `resourceContentUrl` (liens des PDF exportés). Toujours
   * absolue (`siteUrl`) : un PDF partagé l'exige.
   */
  contentUrl(lang: AppLang, courseId: string, resourceId: string): string {
    return publicResourceContentUrl(lang, this.#accessSignal(), courseId, resourceId);
  }

  /** Token de partage actif (query param des sous-requêtes), sinon rien. */
  #params(extra: Record<string, string>): HttpParams {
    let params = new HttpParams();
    const access = this.#accessSignal();
    if (access?.mode === 'token') {
      params = params.set('token', access.key);
    }
    for (const [key, value] of Object.entries(extra)) {
      params = params.set(key, value);
    }
    return params;
  }

  #sameAccess(access: PublicAccess): boolean {
    const current = this.#accessSignal();
    return current?.mode === access.mode && current?.key === access.key;
  }
}

/**
 * URL front stable de lecture d'une ressource côté élève, selon le régime
 * d'accès : `/:lang/shared/:token/resources/:rid` (lien de partage) ou
 * `/:lang/p/courses/:courseId/resources/:rid` (cours public). Sans accès
 * connu (défensif), repli sur le régime public par id de cours.
 */
export function publicResourceContentUrl(
  lang: AppLang,
  access: PublicAccess | null,
  courseId: string,
  resourceId: string,
): string {
  const base =
    access?.mode === 'token' ? `shared/${access.key}` : `p/courses/${courseId}`;
  return `${environment.siteUrl}/${lang}/${base}/resources/${resourceId}`;
}
