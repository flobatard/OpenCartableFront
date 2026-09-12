import {
  Component,
  computed,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AnalyticsService } from '../../../core/analytics/analytics.service';
import {
  COURSE_MODULE_RESOLVER,
  COURSE_RESOURCE_RESOLVER,
} from '../../../core/course-content/course-content-resolvers';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ExportDialog, ExportRequest } from '../../../shared/export-dialog/export-dialog';
import { ExportHtmlService } from '../../../shared/export-html/export-html.service';
import { CourseBlock } from '../../../core/courses/course.model';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { publicCourseLink } from '../../../core/public-courses/public-access';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { PrintService } from '../../../shared/print/print.service';
import { CourseBlocksView } from '../../../shared/course-blocks-view/course-blocks-view';

/**
 * Onglet « Cours entier » (route `content`) — lecture continue : tous les
 * blocs à la suite, dans l'ordre du back. C'est **cette page qui porte les
 * exports** (PDF et page HTML autonome) : les deux services clonent le DOM
 * déjà rendu, il leur faut donc tous les blocs montés — d'où le bouton ici, et
 * pas dans l'en-tête de la coquille (où le `viewChild` n'existerait pas hors
 * de cet onglet).
 *
 * Le builder d'URL passé aux exports est celui du régime public : les liens de
 * ressource du fichier exporté restent consultables sans compte. Même chose
 * pour le résolveur de modules — l'export HTML embarque leur code, lu par les
 * routes publiques.
 */
@Component({
  selector: 'app-student-content',
  imports: [TranslocoPipe, CourseBlocksView, ExportDialog],
  templateUrl: './student-content.html',
  styleUrl: './student-content.scss',
})
export class StudentContent {
  readonly #courses = inject(PublicCourseService);
  readonly #resolver = inject(COURSE_RESOURCE_RESOLVER);
  readonly #modules = inject(COURSE_MODULE_RESOLVER);
  readonly #print = inject(PrintService);
  readonly #exportHtml = inject(ExportHtmlService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly #analytics = inject(AnalyticsService);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Réglages de style du cours — exposés au template (binding `[style]`). */
  protected readonly courseStyle = inject(CourseStyleService);

  protected readonly resources = this.#resolver.list;
  protected readonly blocks = computed<CourseBlock[]>(() => this.#courses.detail()?.blocks ?? []);
  protected readonly courseId = computed(() => this.#courses.detail()?.id ?? '');

  /** Conteneur des blocs rendus — source des exports. */
  protected readonly content = viewChild<ElementRef<HTMLElement>>('content');

  /** Modale de choix du format d'export (PDF ou page HTML autonome). */
  protected readonly exportDialog = viewChild(ExportDialog);

  /** Export HTML en cours : la modale attend (le PDF, lui, est instantané). */
  protected readonly exporting = signal(false);

  /** CTA « Résoudre l'exercice » : le bloc seul, où l'exercice se résout (même régime d'accès). */
  protected readonly exerciseLink = (blockId: string): string[] =>
    publicCourseLink(this.#language.lang(), this.#courses.access(), 'blocks', blockId);

  /** Ouvre la modale de choix du format d'export. */
  protected openExport(): void {
    this.exportDialog()?.open();
  }

  /**
   * Exporte le cours entier dans le format choisi — liens stables du régime
   * public dans les deux cas.
   */
  protected async runExport(request: ExportRequest): Promise<void> {
    const el = this.content()?.nativeElement;
    const courseId = this.courseId();
    if (!this.#isBrowser || !el || courseId === '') {
      return;
    }
    this.exportDialog()?.close();
    if (request.format === 'pdf') {
      this.#analytics.capture('course_pdf_exported', { role: 'student' });
      await this.#print.printCourseContent(el, courseId, (lang, id, resourceId) =>
        this.#courses.contentUrl(lang, id, resourceId),
      );
      return;
    }
    this.exporting.set(true);
    try {
      await this.#exportHtml.exportCourseContent(el, {
        courseId,
        title: this.#courses.detail()?.title ?? '',
        heading: this.#courses.detail()?.title ?? '',
        includeModules: request.includeModules,
        resourceUrl: (lang, id, resourceId) => this.#courses.contentUrl(lang, id, resourceId),
        getModule: (id, moduleId) => this.#modules.getModule(id, moduleId),
      });
      this.#analytics.capture('course_html_exported', {
        scope: 'course',
        modules: request.includeModules,
      });
    } catch {
      this.#notifications.error(this.#transloco.translate('courseExport.failed'));
    } finally {
      this.exporting.set(false);
    }
  }
}
