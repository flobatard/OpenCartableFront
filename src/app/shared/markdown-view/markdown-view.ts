import {
  Component,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  hasCourseDiagrams,
  hasCourseResources,
  renderCourseDiagrams,
  renderCourseMarkdown,
  ResolvedResource,
  resolveCourseResources,
} from '../../core/markdown/course-markdown';
import { resourceKind } from '../../core/markdown/course-resource-ref';
import { PrintService } from '../../core/print/print.service';
import { CourseResource } from '../../core/resources/resource.model';
import { ResourceService } from '../../core/resources/resource.service';
import { ThemeService } from '../../core/theme/theme.service';

/**
 * Vue de rendu markdown de cours réutilisable (présentational, lecture seule) :
 * prend une chaîne markdown en entrée et l'affiche en HTML sûr via le pipeline
 * de `course-markdown` (markdown + KaTeX synchrone, puis passe Mermaid
 * asynchrone). C'est le pipeline d'aperçu, jadis dupliqué dans `markdown-field`
 * et `exercise-editor`, extrait ici et partagé par eux et par l'aperçu global
 * du cours (`course-preview`).
 *
 * Avec un `courseId`, une troisième passe résout les ressources intégrées
 * (`oc-resource:<id>`, cf. `course-resource-ref`) en média/lien via l'URL
 * présignée fraîche du `ResourceService` — la bibliothèque est normalement
 * chargée par la page hôte ; un chargement défensif comble le cas contraire.
 *
 * À la différence des deux consommateurs éditeurs (qui gardaient le rendu sur
 * l'onglet actif pour la paresse), ce composant rend dès qu'il est **monté** :
 * son montage est déjà gouverné par le `@if` de la page hôte. Seule la garde
 * navigateur subsiste — DOMPurify/Mermaid touchent `window`, la page hôte doit
 * être en `RenderMode.Client`.
 */
@Component({
  selector: 'app-markdown-view',
  imports: [TranslocoPipe],
  templateUrl: './markdown-view.html',
  styleUrl: './markdown-view.scss',
})
export class MarkdownView {
  readonly #sanitizer = inject(DomSanitizer);
  readonly #theme = inject(ThemeService);
  readonly #transloco = inject(TranslocoService);
  readonly #resources = inject(ResourceService);
  readonly #print = inject(PrintService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Exposé au template : le bouton d'impression n'a de sens qu'au navigateur. */
  protected readonly isBrowser = this.#isBrowser;

  /** Conteneur du HTML rendu — source de l'export PDF. */
  protected readonly contentEl = viewChild<ElementRef<HTMLElement>>('content');

  /** Markdown à rendre (frappe en cours ou contenu d'un bloc). */
  readonly markdown = input.required<string>();

  /**
   * Cours propriétaire des ressources référencées. `null` (défaut) : les
   * `oc-resource:` ne sont pas résolus (composant hors contexte cours).
   */
  readonly courseId = input<string | null>(null);

  /** Cours pour lequel un chargement défensif de la biblio a déjà été tenté. */
  #loadedCourseId: string | null = null;

  /**
   * HTML rendu (markdown + KaTeX, puis diagrammes Mermaid, puis ressources). La
   * sanitisation vit dans course-markdown (DOMPurify) ; le bypass évite
   * uniquement le second nettoyage d'Angular, qui dépouillerait les attributs
   * style et le MathML/SVG dont dépendent KaTeX et Mermaid. Signal (et non
   * computed) car les passes Mermaid/ressources sont asynchrones.
   */
  readonly #html = signal<SafeHtml>(this.#sanitizer.bypassSecurityTrustHtml(''));
  protected readonly html = this.#html.asReadonly();

  constructor() {
    // Chargement défensif de la bibliothèque : seulement si aucun hôte ne l'a
    // chargée pour ce cours (liste vide et pas en cours) — sinon on écraserait
    // la liste déjà présente. `untracked` : ne réagit qu'au changement de cours.
    effect(() => {
      const courseId = this.courseId();
      if (!this.#isBrowser || courseId === null || this.#loadedCourseId === courseId) {
        return;
      }
      this.#loadedCourseId = courseId;
      untracked(() => {
        if (this.#resources.list().length === 0 && !this.#resources.listLoading()) {
          this.#resources.loadList(courseId);
        }
      });
    });

    // Rendu markdown+KaTeX synchrone (chemin rapide), puis passes asynchrones
    // Mermaid et ressources. Gardé sur le navigateur. Re-rendu quand le
    // markdown, le thème ou la bibliothèque change.
    effect((onCleanup) => {
      if (!this.#isBrowser) {
        return;
      }
      const theme = this.#theme.theme();
      const courseId = this.courseId();
      const base = renderCourseMarkdown(this.markdown());
      this.#html.set(this.#sanitizer.bypassSecurityTrustHtml(base));

      const needsDiagrams = hasCourseDiagrams(base);
      const hasResources = courseId !== null && hasCourseResources(base);
      // Lecture réactive : le rendu se rejoue à l'arrivée de la bibliothèque. On
      // ne résout qu'une fois le chargement terminé — évite un flash « indisponible ».
      const list = hasResources ? this.#resources.list() : EMPTY_RESOURCES;
      const resolveResources = hasResources && !this.#resources.listLoading();
      if (!needsDiagrams && !resolveResources) {
        return;
      }

      // Changement de markdown/thème/liste pendant le rendu async : passe périmée ignorée.
      let stale = false;
      onCleanup(() => (stale = true));
      void this.#renderAsync(base, theme, needsDiagrams, resolveResources, courseId, list).then(
        (enhanced) => {
          if (!stale) {
            this.#html.set(this.#sanitizer.bypassSecurityTrustHtml(enhanced));
          }
        },
      );
    });
  }

  /** Enchaîne les passes async (diagrammes puis ressources) sur le HTML de base. */
  async #renderAsync(
    base: string,
    theme: 'light' | 'dark',
    needsDiagrams: boolean,
    resolveResources: boolean,
    courseId: string | null,
    list: readonly CourseResource[],
  ): Promise<string> {
    let html = base;
    if (needsDiagrams) {
      const mathNote = this.#transloco.translate('markdownField.mermaidMathNote');
      const errorLabel = this.#transloco.translate('markdownField.mermaidError');
      html = await renderCourseDiagrams(html, theme, mathNote, errorLabel);
    }
    if (resolveResources && courseId !== null) {
      const missing = this.#transloco.translate('markdownField.resourceMissing');
      html = await resolveCourseResources(html, (id) => this.#resolveResource(courseId, list, id), missing);
    }
    return html;
  }

  /** Résout un id de ressource en URL présignée + type de rendu, ou `null`. */
  async #resolveResource(
    courseId: string,
    list: readonly CourseResource[],
    id: string,
  ): Promise<ResolvedResource | null> {
    const resource = list.find((r) => r.id === id);
    if (!resource || resource.statut !== 'disponible') {
      return null;
    }
    const url = await this.#resources.getDownloadUrl(courseId, id);
    return { url, kind: resourceKind(resource.type), label: resource.nom_original };
  }

  /**
   * Exporte le contenu rendu en PDF (impression navigateur). Hook réutilisable
   * pour les hôtes qui veulent un bouton d'export ; no-op au SSR ou avant le
   * montage du contenu.
   */
  async print(): Promise<void> {
    const el = this.contentEl()?.nativeElement;
    if (!this.#isBrowser || !el) {
      return;
    }
    await this.#print.printCourseContent(el, this.courseId());
  }
}

/** Liste vide stable (évite d'abonner l'effet à `list` quand inutile). */
const EMPTY_RESOURCES: readonly CourseResource[] = [];
