import { Component, effect, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownEditor } from '../markdown-editor/markdown-editor';
import { MarkdownView } from '../markdown-view/markdown-view';

/** Frappe → aperçu : assez court pour rester « live », assez long pour ne pas
 *  remonter une iframe GeoGebra / retracer une figure à chaque caractère (le
 *  montage des extensions re-court à chaque valeur rendue). */
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * Bac à sable markdown des pages de documentation : éditeur Monaco et rendu
 * live côte à côte — l'utilisateur reprend l'exemple, le modifie et voit le
 * résultat (formule KaTeX, diagramme mermaid, extension geogebra/jsxgraph…).
 *
 * `initial` est lu UNE seule fois (patron [initial] de l'exercise-editor).
 * Le `FormControl` est public (exception à la convention `protected`,
 * patron markdown-field) : jsdom ne peut pas taper dans monaco, les specs
 * pilotent le contrôle. Usage Client-only (Monaco + markdown-view).
 */
@Component({
  selector: 'app-markdown-playground',
  imports: [MarkdownEditor, MarkdownView, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './markdown-playground.html',
  styleUrl: './markdown-playground.scss',
})
export class MarkdownPlayground {
  /** Contenu d'exemple initial du bac à sable (lu une seule fois). */
  readonly initial = input.required<string>();

  readonly control = new FormControl<string>('', { nonNullable: true });

  readonly #draft = signal('');
  /** Markdown affiché par l'aperçu — suit la frappe, débouncé. */
  protected readonly draft = this.#draft.asReadonly();

  #initialised = false;

  constructor() {
    // La frappe alimente l'aperçu après debounce (rxjs écrit dans un signal).
    this.control.valueChanges
      .pipe(debounceTime(PREVIEW_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((value) => this.#draft.set(value));

    // Initialisation unique : pose la valeur ET l'aperçu immédiatement (sans
    // attendre le debounce) — l'exemple est visible dès le montage.
    effect(() => {
      const initial = this.initial();
      if (this.#initialised) {
        return;
      }
      this.#initialised = true;
      this.control.setValue(initial);
      this.#draft.set(initial);
    });
  }
}
