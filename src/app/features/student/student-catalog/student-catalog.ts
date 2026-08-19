import { Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { PublicCourseCard } from '../../../shared/public-course-card/public-course-card';
import { Spinner } from '../../../shared/spinner/spinner';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';

/**
 * Catalogue public d'un prof (`/:lang/p/:profId`, J2) : ses cours `public`
 * uniquement, en cartes « Ouvrir le cours » vers `/p/courses/:id`. Page
 * anonyme sans compte : la seule identité affichée est le `nom_public`
 * choisi par le prof (absent → titre générique). Un prof inconnu répond la
 * même chose qu'un prof sans cours public (pas d'oracle d'existence).
 * Client-only (`RenderMode.Client`).
 */
@Component({
  selector: 'app-student-catalog',
  imports: [TranslocoPipe, PublicCourseCard, Spinner, UserAvatar],
  templateUrl: './student-catalog.html',
  styleUrl: './student-catalog.scss',
})
export class StudentCatalog {
  readonly #courses = inject(PublicCourseService);
  readonly #route = inject(ActivatedRoute);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly language = inject(LanguageService);

  // Param en snapshot (convention repo) : cible de lien externe.
  readonly #profId = this.#route.snapshot.paramMap.get('profId') ?? '';

  protected readonly catalog = this.#courses.catalog;
  protected readonly loading = this.#courses.catalogLoading;
  protected readonly error = computed(
    () => this.#profId === '' || this.#courses.catalogError(),
  );

  constructor() {
    if (this.#isBrowser && this.#profId !== '') {
      this.#courses.loadCatalog(this.#profId);
    }
  }

  /** Lien d'un cours du catalogue (régime public par id). */
  protected courseLink(courseId: string): string[] {
    return ['/', this.language.lang(), 'p', 'courses', courseId];
  }
}
