import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AnalyticsService } from '../../../core/analytics/analytics.service';
import { CourseService } from '../../../core/courses/course.service';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { PrintService } from '../../../shared/print/print.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { CourseBlocksView } from '../../../shared/course-blocks-view/course-blocks-view';
import { CourseStyleDialog } from '../../../shared/course-style-dialog/course-style-dialog';
import { COURSE_MODULE_RESOLVER } from '../../../core/course-content/course-content-resolvers';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ExportDialog, ExportRequest } from '../../../shared/export-dialog/export-dialog';
import { ExportHtmlService } from '../../../shared/export-html/export-html.service';

/**
 * Aperçu global d'un cours (onglet « Aperçu » de la page cours) : le cours tel
 * que le verra l'élève. Le rendu par bloc est délégué au composant partagé
 * `CourseBlocksView` (`shared/course-blocks-view/`), commun avec la vue élève
 * publique — cette page ne garde que le contexte prof : chargement de la
 * bibliothèque (`ResourceService`), style de lecture, barre d'actions
 * (« Style de lecture », « Exporter » → PDF ou page HTML autonome).
 *
 * Rendu **par bloc** (pas de markdown concaténé) : les blocs `document`
 * s'intercalent entre texte et exercice et ne sont pas du markdown. Texte et
 * exercice passent par `app-markdown-view` (pipeline partagé) ; les documents
 * par `app-course-preview-document` (média intégré / carte) ; les modules
 * interactifs par `app-module-embed` (iframe sandbox origine opaque, résolue
 * par id — module supprimé → notice ; un bloc `module` encore vide est
 * entièrement masqué, cf. `blocks`).
 *
 * Navigateur uniquement : `app-markdown-view` et la résolution d'URL présignée
 * touchent `window` — la page hôte (courses/:id) est en `RenderMode.Client`, et
 * ce composant n'est monté que lorsque l'onglet Aperçu est actif.
 */
@Component({
  selector: 'app-course-preview',
  imports: [TranslocoPipe, CourseBlocksView, CourseStyleDialog, ExportDialog],
  templateUrl: './course-preview.html',
  styleUrl: './course-preview.scss',
})
export class CoursePreview {
  readonly #courses = inject(CourseService);
  readonly #resources = inject(ResourceService);
  readonly #modules = inject(COURSE_MODULE_RESOLVER);
  readonly #print = inject(PrintService);
  readonly #exportHtml = inject(ExportHtmlService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly #analytics = inject(AnalyticsService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Réglages de style du cours — exposés au template (binding `[style]`). */
  protected readonly courseStyle = inject(CourseStyleService);

  readonly courseId = input.required<string>();

  /** Conteneur des blocs rendus — source de l'export PDF (hors bouton). */
  protected readonly previewContent = viewChild<ElementRef<HTMLElement>>('previewContent');

  /** Modale de style, ouverte par le bouton général de la barre d'actions. */
  protected readonly styleDialog = viewChild(CourseStyleDialog);

  /** Modale de choix du format d'export (PDF ou page HTML autonome). */
  protected readonly exportDialog = viewChild(ExportDialog);

  /** Export HTML en cours : la modale attend (le PDF, lui, est instantané). */
  protected readonly exporting = signal(false);

  /** Blocs du cours chargé par la page hôte, déjà ordonnés par le back.
   *  Vue élève : un bloc `module` encore vide (`module_id` null) est masqué
   *  en entier — rien à montrer, et la notice « Aucun module choisi » de
   *  l'embed est un message d'autorat qui partirait sinon dans l'aperçu et
   *  le PDF (l'hôte sans `data-oc-module-id` échappe à `transformForPrint`). */
  protected readonly blocks = computed(() =>
    (this.#courses.detail()?.blocks ?? []).filter(
      (block) => block.type !== 'module' || block.module_id !== null,
    ),
  );

  /** Bibliothèque du cours (résolution des blocs document par la vue partagée). */
  protected readonly resourceList = this.#resources.list;

  constructor() {
    // Charge la bibliothèque de ressources au montage (onglet Aperçu actif) —
    // couvre le deep-link `?tab=preview` à froid et rafraîchit une liste périmée.
    // Signal racine partagé avec l'onglet Ressources.
    effect(() => {
      const courseId = this.courseId();
      if (this.#isBrowser) {
        this.#resources.loadList(courseId);
      }
      // Applique les réglages de style enregistrés du cours dès que son détail
      // est là (idempotent sur le même cours — ne clobbe pas une édition en vol).
      const detail = this.#courses.detail();
      if (detail?.id === courseId) {
        this.courseStyle.load(courseId, detail.preview_settings);
      }
    });
  }

  /** Ouvre la modale de réglage du style de lecture du cours. */
  protected openStyle(): void {
    this.styleDialog()?.open();
  }

  /** Ouvre la modale de choix du format d'export. */
  protected openExport(): void {
    this.exportDialog()?.open();
  }

  /**
   * Exporte le cours entier dans le format choisi : PDF par l'impression
   * native, ou page HTML autonome (modules interactifs embarqués vivants).
   * No-op au SSR.
   */
  protected async runExport(request: ExportRequest): Promise<void> {
    const el = this.previewContent()?.nativeElement;
    if (!this.#isBrowser || !el) {
      return;
    }
    this.exportDialog()?.close();
    if (request.format === 'pdf') {
      this.#analytics.capture('course_pdf_exported', { role: 'teacher' });
      await this.#print.printCourseContent(el, this.courseId());
      return;
    }
    this.exporting.set(true);
    try {
      await this.#exportHtml.exportCourseContent(el, {
        courseId: this.courseId(),
        title: this.#courses.detail()?.title ?? '',
        heading: this.#courses.detail()?.title ?? '',
        includeModules: request.includeModules,
        getModule: (courseId, moduleId) => this.#modules.getModule(courseId, moduleId),
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
