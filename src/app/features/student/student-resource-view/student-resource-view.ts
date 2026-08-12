import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  publicAccessFromRoute,
  publicCourseSegments,
} from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { Spinner } from '../../../shared/spinner/spinner';

/**
 * Pendant PUBLIC de `resource-view` : cible des liens de ressource des PDF
 * exportés côté élève (`PublicCourseService.contentUrl`). Résout d'abord le
 * cours du régime d'accès (le token/l'id vient de l'URL — le détail, partagé
 * avec la page cours, donne l'id de cours nécessaire au presign), présigne la
 * lecture inline SANS Bearer, puis redirige le navigateur vers l'URL S3.
 * `location.replace` : pas d'entrée d'historique. Erreurs : message générique
 * unique (404 back quel que soit le motif) ; 409 = upload non confirmé.
 */
@Component({
  selector: 'app-student-resource-view',
  imports: [TranslocoPipe, RouterLink, Spinner],
  template: `
    @if (error(); as reason) {
      <p class="student-resource-message">
        {{ 'student.resource.' + reason | transloco }}
      </p>
      @if (backLink(); as link) {
        <a [routerLink]="link">{{ 'student.course.backToCourse' | transloco }}</a>
      }
    } @else {
      <app-spinner size="lg" />
      <p class="student-resource-message" aria-live="polite">
        {{ 'student.resource.opening' | transloco }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 48px 24px;
      text-align: center;
    }

    .student-resource-message {
      color: var(--text-secondary);
    }
  `,
})
export class StudentResourceView implements OnInit {
  readonly #courses = inject(PublicCourseService);
  readonly #route = inject(ActivatedRoute);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Params en snapshot (convention repo) : cible de lien externe.
  readonly #access = publicAccessFromRoute(this.#route);
  readonly #resourceId = this.#route.snapshot.paramMap.get('resourceId') ?? '';

  readonly error = signal<'notFound' | 'unavailable' | null>(null);

  /** Retour vers la racine du cours dans le même régime d'accès. */
  protected backLink(): string[] | null {
    return this.#access === null
      ? null
      : ['/', this.#language.lang(), ...publicCourseSegments(this.#access)];
  }

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    if (this.#access === null || this.#resourceId === '') {
      this.error.set('notFound');
      return;
    }
    const detail = await this.#courses.loadCourse(this.#access);
    if (detail === null) {
      this.error.set('notFound');
      return;
    }
    try {
      const url = await this.#courses.getDownloadUrl(detail.id, this.#resourceId, 'inline');
      this.redirectTo(url);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 409 ? 'unavailable' : 'notFound',
      );
    }
  }

  /**
   * Indirection publique (exception à la convention `protected`) :
   * `location.replace` n'est pas espionnable en jsdom, les specs espionnent
   * cette méthode à la place (motif `resource-view`).
   */
  redirectTo(url: string): void {
    window.location.replace(url);
  }
}
