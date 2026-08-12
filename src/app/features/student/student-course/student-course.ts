import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { COURSE_RESOURCE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { PrintService } from '../../../core/print/print.service';
import {
  publicAccessFromRoute,
  publicCourseSegments,
} from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { CourseBlocksView } from '../../../shared/course-blocks-view/course-blocks-view';
import { Spinner } from '../../../shared/spinner/spinner';

/**
 * Vue élève d'un cours partagé (J2) — page publique, sans compte ni Zitadel.
 * Deux régimes, un seul composant (mode lu en snapshot via `data.access`) :
 * lien de partage (`/:lang/shared/:token`) ou cours public direct
 * (`/:lang/p/courses/:courseId`).
 *
 * Le rendu par bloc est délégué à `CourseBlocksView` (partagé avec l'aperçu
 * prof) ; les résolveurs publics fournis par la route (`app.routes.ts`)
 * branchent ressources et modules sur `/v1/public/*` — aucun Bearer. Le style
 * de lecture du cours s'applique en lecture seule (`[showSettings]="false"`
 * partout, aucun bouton de réglage). Toute erreur affiche le même message
 * générique : le back répond 404 quel que soit le motif (pas d'oracle).
 *
 * Client-only (`RenderMode.Client`) : markdown-view/DOMPurify/iframe sandbox.
 */
@Component({
  selector: 'app-student-course',
  imports: [TranslocoPipe, CourseBlocksView, Spinner],
  templateUrl: './student-course.html',
  styleUrl: './student-course.scss',
})
export class StudentCourse {
  readonly #courses = inject(PublicCourseService);
  readonly #resolver = inject(COURSE_RESOURCE_RESOLVER);
  readonly #print = inject(PrintService);
  readonly #language = inject(LanguageService);
  readonly #route = inject(ActivatedRoute);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Réglages de style du cours — exposés au template (binding `[style]`). */
  protected readonly courseStyle = inject(CourseStyleService);

  /** Régime d'accès de la route (snapshot — cible de lien externe). */
  readonly #access = publicAccessFromRoute(this.#route);

  protected readonly detail = this.#courses.detail;
  protected readonly loading = this.#courses.detailLoading;
  /** Accès mal formé ou refusé par le back : même message générique. */
  protected readonly error = computed(
    () => this.#access === null || this.#courses.detailError(),
  );

  /** Ressources publiques sous la forme attendue par la vue de blocs. */
  protected readonly resources = this.#resolver.list;

  /** Conteneur des blocs rendus — source de l'export PDF. */
  protected readonly content = viewChild<ElementRef<HTMLElement>>('content');

  /** CTA « Résoudre l'exercice » : route dédiée du bloc, même régime d'accès. */
  protected readonly exerciseLink = (blockId: string): string[] =>
    this.#access === null
      ? []
      : ['/', this.#language.lang(), ...publicCourseSegments(this.#access), 'exercises', blockId];

  constructor() {
    if (this.#isBrowser && this.#access !== null) {
      void this.#courses.loadCourse(this.#access);
    }
    // Applique le style de lecture enregistré du cours dès que le détail est là.
    effect(() => {
      const detail = this.detail();
      if (detail !== null) {
        this.courseStyle.load(detail.id, detail.preview_settings);
      }
    });
  }

  /** Exporte le cours entier en PDF — liens stables du régime public. */
  protected async download(): Promise<void> {
    const el = this.content()?.nativeElement;
    const detail = this.detail();
    if (!this.#isBrowser || !el || detail === null) {
      return;
    }
    await this.#print.printCourseContent(el, detail.id, (lang, courseId, resourceId) =>
      this.#courses.contentUrl(lang, courseId, resourceId),
    );
  }
}
