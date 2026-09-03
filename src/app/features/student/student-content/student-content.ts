import {
  Component,
  computed,
  ElementRef,
  inject,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { COURSE_RESOURCE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { CourseBlock } from '../../../core/courses/course.model';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { publicCourseLink } from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { PrintService } from '../../../core/print/print.service';
import { CourseBlocksView } from '../../../shared/course-blocks-view/course-blocks-view';

/**
 * Onglet « Cours entier » (route `content`) — lecture continue : tous les
 * blocs à la suite, dans l'ordre du back. C'est **cette page qui porte
 * l'export PDF** : `PrintService` clone le DOM déjà rendu, il lui faut donc
 * tous les blocs montés — d'où le bouton ici, et pas dans l'en-tête de la
 * coquille (où le `viewChild` n'existerait pas hors de cet onglet).
 *
 * Le builder d'URL passé à l'impression est celui du régime public : les liens
 * de ressource du PDF exporté restent consultables sans compte.
 */
@Component({
  selector: 'app-student-content',
  imports: [TranslocoPipe, CourseBlocksView],
  templateUrl: './student-content.html',
  styleUrl: './student-content.scss',
})
export class StudentContent {
  readonly #courses = inject(PublicCourseService);
  readonly #resolver = inject(COURSE_RESOURCE_RESOLVER);
  readonly #print = inject(PrintService);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Réglages de style du cours — exposés au template (binding `[style]`). */
  protected readonly courseStyle = inject(CourseStyleService);

  protected readonly resources = this.#resolver.list;
  protected readonly blocks = computed<CourseBlock[]>(() => this.#courses.detail()?.blocks ?? []);
  protected readonly courseId = computed(() => this.#courses.detail()?.id ?? '');

  /** Conteneur des blocs rendus — source de l'export PDF. */
  protected readonly content = viewChild<ElementRef<HTMLElement>>('content');

  /** CTA « Résoudre l'exercice » : le bloc seul, où l'exercice se résout (même régime d'accès). */
  protected readonly exerciseLink = (blockId: string): string[] =>
    publicCourseLink(this.#language.lang(), this.#courses.access(), 'blocks', blockId);

  /** Exporte le cours entier en PDF — liens stables du régime public. */
  protected async download(): Promise<void> {
    const el = this.content()?.nativeElement;
    const courseId = this.courseId();
    if (!this.#isBrowser || !el || courseId === '') {
      return;
    }
    await this.#print.printCourseContent(el, courseId, (lang, id, resourceId) =>
      this.#courses.contentUrl(lang, id, resourceId),
    );
  }
}
