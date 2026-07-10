import { Component, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import {
  hasCourseDiagrams,
  renderCourseDiagrams,
  renderCourseMarkdown,
} from '../../core/markdown/course-markdown';
import { ThemeService } from '../../core/theme/theme.service';

/**
 * Vue de rendu markdown de cours réutilisable (présentational, lecture seule) :
 * prend une chaîne markdown en entrée et l'affiche en HTML sûr via le pipeline
 * de `course-markdown` (markdown + KaTeX synchrone, puis passe Mermaid
 * asynchrone). C'est le pipeline d'aperçu, jadis dupliqué dans `markdown-field`
 * et `exercise-editor`, extrait ici et partagé par eux et par l'aperçu global
 * du cours (`course-preview`).
 *
 * À la différence des deux consommateurs éditeurs (qui gardaient le rendu sur
 * l'onglet actif pour la paresse), ce composant rend dès qu'il est **monté** :
 * son montage est déjà gouverné par le `@if` de la page hôte. Seule la garde
 * navigateur subsiste — DOMPurify/Mermaid touchent `window`, la page hôte doit
 * être en `RenderMode.Client`.
 */
@Component({
  selector: 'app-markdown-view',
  imports: [],
  templateUrl: './markdown-view.html',
  styleUrl: './markdown-view.scss',
})
export class MarkdownView {
  readonly #sanitizer = inject(DomSanitizer);
  readonly #theme = inject(ThemeService);
  readonly #transloco = inject(TranslocoService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Markdown à rendre (frappe en cours ou contenu d'un bloc). */
  readonly markdown = input.required<string>();

  /**
   * HTML rendu (markdown + KaTeX, puis diagrammes Mermaid). La sanitisation vit
   * dans course-markdown (DOMPurify) ; le bypass évite uniquement le second
   * nettoyage d'Angular, qui dépouillerait les attributs style et le MathML/SVG
   * dont dépendent KaTeX et Mermaid. Signal (et non computed) car la passe
   * Mermaid est asynchrone.
   */
  readonly #html = signal<SafeHtml>(this.#sanitizer.bypassSecurityTrustHtml(''));
  protected readonly html = this.#html.asReadonly();

  constructor() {
    // Rendu markdown+KaTeX synchrone (chemin rapide), puis passe Mermaid
    // asynchrone. Gardé sur le navigateur (DOMPurify/Mermaid). Re-rendu quand le
    // markdown ou le thème change.
    effect((onCleanup) => {
      if (!this.#isBrowser) {
        return;
      }
      const theme = this.#theme.theme();
      const base = renderCourseMarkdown(this.markdown());
      this.#html.set(this.#sanitizer.bypassSecurityTrustHtml(base));
      if (!hasCourseDiagrams(base)) {
        return;
      }
      // Changement de markdown/thème pendant le rendu async : passe périmée ignorée.
      let stale = false;
      onCleanup(() => (stale = true));
      const mathNote = this.#transloco.translate('markdownField.mermaidMathNote');
      const errorLabel = this.#transloco.translate('markdownField.mermaidError');
      void renderCourseDiagrams(base, theme, mathNote, errorLabel).then((enhanced) => {
        if (!stale) {
          this.#html.set(this.#sanitizer.bypassSecurityTrustHtml(enhanced));
        }
      });
    });
  }
}
