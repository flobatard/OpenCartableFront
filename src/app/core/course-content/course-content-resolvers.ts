import { inject, Injectable, InjectionToken, Signal } from '@angular/core';
import { AppLang } from '../i18n/language.service';
import { ModuleDetail } from '../modules/module.model';
import { ModuleService } from '../modules/module.service';
import { CourseResource } from '../resources/resource.model';
import { ResourceService } from '../resources/resource.service';
import { resourceContentUrl } from '../resources/resource.utils';

/**
 * Abstraction des accès « contenu de cours » des composants de rendu partagés
 * (`markdown-view`, `course-preview-document`, `module-embed`,
 * `course-blocks-view`) : le même rendu sert le prof authentifié ET l'élève
 * anonyme, seule la source des données change.
 *
 * - Côté prof, les tokens résolvent par défaut vers `ResourceService`/
 *   `ModuleService` (Bearer automatique) — **aucun provider à déclarer**.
 * - Côté élève, les routes publiques fournissent `PublicResourceResolver`/
 *   `PublicModuleResolver` (`core/public-courses/`), adossés aux endpoints
 *   `/v1/public/*` sans Bearer.
 *
 * Les composants de rendu n'injectent QUE ces tokens (jamais les services
 * prof directement) : c'est l'invariant qui garde la vue élève sans OIDC.
 */

/** Résolution des ressources S3 d'un cours (bibliothèque + URL présignées). */
export interface CourseResourceResolver {
  /** Ressources connues du cours courant (`status` `available` requis pour résoudre). */
  readonly list: Signal<readonly CourseResource[]>;
  /** Vrai pendant le chargement de la bibliothèque (le rendu attend la fin). */
  readonly listLoading: Signal<boolean>;
  /**
   * Chargement défensif de la bibliothèque, si aucun hôte ne l'a fournie.
   * Impl. prof : GET de la liste (une fois) ; impl. publique : no-op — les
   * ressources arrivent avec le détail public du cours.
   */
  ensureList(courseId: string): void;
  /** URL présignée fraîche de lecture (TTL court, jamais stockée). */
  getDownloadUrl(
    courseId: string,
    resourceId: string,
    disposition?: 'attachment' | 'inline',
  ): Promise<string>;
  /**
   * URL front **stable** de lecture d'une ressource — celle qu'embarquent les
   * PDF exportés (cf. `print.service`). Prof : route protégée
   * `/courses/:id/resources/:rid` ; élève : sa contrepartie publique.
   */
  contentUrl(lang: AppLang, courseId: string, resourceId: string): string;
}

/** Résolution du code d'un module interactif (exécuté en iframe sandbox). */
export interface CourseModuleResolver {
  getModule(courseId: string, moduleId: string): Promise<ModuleDetail>;
}

/** Impl. prof par défaut : délègue à `ResourceService` (Bearer automatique). */
@Injectable({ providedIn: 'root' })
export class ProfResourceResolver implements CourseResourceResolver {
  readonly #resources = inject(ResourceService);

  readonly list = this.#resources.list;
  readonly listLoading = this.#resources.listLoading;

  ensureList(courseId: string): void {
    // Seulement si aucun hôte n'a chargé la bibliothèque (liste vide et pas
    // en cours) — sinon on écraserait la liste déjà présente.
    if (this.#resources.list().length === 0 && !this.#resources.listLoading()) {
      this.#resources.loadList(courseId);
    }
  }

  getDownloadUrl(
    courseId: string,
    resourceId: string,
    disposition?: 'attachment' | 'inline',
  ): Promise<string> {
    // Le défaut reste celui de ResourceService (forme d'appel de référence,
    // assertée par ses specs) : on ne le matérialise pas ici.
    return disposition === undefined
      ? this.#resources.getDownloadUrl(courseId, resourceId)
      : this.#resources.getDownloadUrl(courseId, resourceId, disposition);
  }

  contentUrl(lang: AppLang, courseId: string, resourceId: string): string {
    return resourceContentUrl(lang, courseId, resourceId);
  }
}

/** Impl. prof par défaut : délègue à `ModuleService` (cache par id, Bearer). */
@Injectable({ providedIn: 'root' })
export class ProfModuleResolver implements CourseModuleResolver {
  readonly #modules = inject(ModuleService);

  getModule(courseId: string, moduleId: string): Promise<ModuleDetail> {
    return this.#modules.getModule(courseId, moduleId);
  }
}

export const COURSE_RESOURCE_RESOLVER = new InjectionToken<CourseResourceResolver>(
  'COURSE_RESOURCE_RESOLVER',
  { providedIn: 'root', factory: () => inject(ProfResourceResolver) },
);

export const COURSE_MODULE_RESOLVER = new InjectionToken<CourseModuleResolver>(
  'COURSE_MODULE_RESOLVER',
  { providedIn: 'root', factory: () => inject(ProfModuleResolver) },
);
