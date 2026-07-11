import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { CourseBlock } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { CourseStyleService } from '../../../core/courses/course-style.service';
import { exerciseMarkdownFromContent } from '../../../core/courses/exercise-form';
import { PrintService } from '../../../core/print/print.service';
import { CourseResource } from '../../../core/resources/resource.model';
import { ResourceService } from '../../../core/resources/resource.service';
import { CourseStyleDialog } from '../../../shared/course-style-dialog/course-style-dialog';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';
import { CoursePreviewDocument } from './course-preview-document';

/**
 * Aperçu global d'un cours (onglet « Aperçu » de la page cours) : rend tous les
 * blocs prévisualisables les uns à la suite des autres, dans l'ordre du back —
 * le cours tel que le verra l'élève. Vue élève : les blocs `module` (placeholder
 * J4) sont **omis** et les réponses attendues des exercices restent masquées
 * (via `exerciseMarkdownFromContent`).
 *
 * Rendu **par bloc** (pas de markdown concaténé) : les blocs `document`
 * s'intercalent entre texte et exercice et ne sont pas du markdown. Texte et
 * exercice passent par `app-markdown-view` (pipeline partagé) ; les documents
 * par `app-course-preview-document` (média intégré / carte).
 *
 * Navigateur uniquement : `app-markdown-view` et la résolution d'URL présignée
 * touchent `window` — la page hôte (courses/:id) est en `RenderMode.Client`, et
 * ce composant n'est monté que lorsque l'onglet Aperçu est actif.
 */
@Component({
  selector: 'app-course-preview',
  imports: [TranslocoPipe, MarkdownView, CoursePreviewDocument, CourseStyleDialog],
  templateUrl: './course-preview.html',
  styleUrl: './course-preview.scss',
})
export class CoursePreview {
  readonly #courses = inject(CourseService);
  readonly #resources = inject(ResourceService);
  readonly #print = inject(PrintService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Réglages de style du cours — exposés au template (binding `[style]`). */
  protected readonly courseStyle = inject(CourseStyleService);

  readonly courseId = input.required<string>();

  /** Conteneur des blocs rendus — source de l'export PDF (hors bouton). */
  protected readonly previewContent = viewChild<ElementRef<HTMLElement>>('previewContent');

  /** Modale de style, ouverte par le bouton général de la barre d'actions. */
  protected readonly styleDialog = viewChild(CourseStyleDialog);

  /** Blocs du cours chargé par la page hôte, déjà ordonnés par le back. */
  protected readonly blocks = computed(() => this.#courses.detail()?.blocks ?? []);

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

  /** Markdown d'un bloc texte (`content.markdown`, gardé string). */
  protected textMarkdown(block: CourseBlock): string {
    return typeof block.content['markdown'] === 'string' ? block.content['markdown'] : '';
  }

  /** Markdown concaténé d'un bloc exercice (sujet + énoncés, réponses exclues). */
  protected exerciseMarkdown(block: CourseBlock): string {
    return exerciseMarkdownFromContent(block.content);
  }

  /** Légende éditoriale d'un bloc document (`content.legende`, gardé string). */
  protected documentLegende(block: CourseBlock): string | null {
    return typeof block.content['legende'] === 'string' ? block.content['legende'] : null;
  }

  /** Ressource pointée par un bloc document (id inconnu/supprimé → `undefined`). */
  protected resourceFor(id: string | null): CourseResource | undefined {
    return id === null ? undefined : this.#resources.list().find((r) => r.id === id);
  }

  /** Exporte le cours entier en PDF (impression navigateur). No-op au SSR. */
  protected async download(): Promise<void> {
    const el = this.previewContent()?.nativeElement;
    if (!this.#isBrowser || !el) {
      return;
    }
    await this.#print.printCourseContent(el, this.courseId());
  }
}
