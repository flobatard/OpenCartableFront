import { computed, inject, Injectable } from '@angular/core';
import {
  CourseModuleResolver,
  CourseResourceResolver,
} from '../course-content/course-content-resolvers';
import { AppLang } from '../i18n/language.service';
import { ModuleDetail } from '../modules/module.model';
import { CourseResource } from '../resources/resource.model';
import { PublicCourseService } from './public-course.service';

/**
 * Résolveurs de contenu du régime élève : fournis PAR LES ROUTES publiques
 * (`providers` des sous-arbres `shared/:token` et `p/courses/:courseId` dans
 * `app.routes.ts`) à la place des impl. prof par défaut. Les composants de
 * rendu partagés (`markdown-view`, `course-preview-document`, `module-embed`)
 * ne voient que les tokens — ils fonctionnent tels quels sans Bearer.
 */

/** Ressources : adossées au détail public déjà chargé (pas de liste dédiée). */
@Injectable()
export class PublicResourceResolver implements CourseResourceResolver {
  readonly #courses = inject(PublicCourseService);

  /**
   * Les ressources publiques arrivent avec le détail du cours, toutes
   * `disponible` par contrat — on les présente sous la forme `CourseResource`
   * attendue par les composants de rendu (timestamps absents du contrat
   * public, sans consommateur côté rendu).
   */
  readonly list = computed<readonly CourseResource[]>(
    () =>
      this.#courses.detail()?.resources.map((r) => ({
        ...r,
        statut: 'disponible' as const,
        created_at: '',
        updated_at: '',
      })) ?? [],
  );

  readonly listLoading = this.#courses.detailLoading;

  /** No-op : la « bibliothèque » est le détail public, chargé par la page. */
  ensureList(): void {}

  getDownloadUrl(
    courseId: string,
    resourceId: string,
    disposition: 'attachment' | 'inline' = 'attachment',
  ): Promise<string> {
    return this.#courses.getDownloadUrl(courseId, resourceId, disposition);
  }

  contentUrl(lang: AppLang, courseId: string, resourceId: string): string {
    return this.#courses.contentUrl(lang, courseId, resourceId);
  }
}

/** Modules : code servi par l'endpoint public (token rejoué en query param). */
@Injectable()
export class PublicModuleResolver implements CourseModuleResolver {
  readonly #courses = inject(PublicCourseService);

  getModule(courseId: string, moduleId: string): Promise<ModuleDetail> {
    return this.#courses.getModule(courseId, moduleId);
  }
}
