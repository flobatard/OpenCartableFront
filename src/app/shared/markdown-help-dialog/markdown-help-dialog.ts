import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';

/**
 * Modale d'aide à la mise en forme (markdown + LaTeX/KaTeX + Mermaid +
 * extensions GeoGebra/JSXGraph), réutilisable par tout éditeur de contenu de
 * cours. Élément `<dialog>` natif : focus-trap, Escape et backdrop gérés par
 * la plateforme. Présentational — pilotée par le parent via les méthodes
 * publiques `open()` / `close()`.
 *
 * Chaque section renvoie vers sa page `/:lang/markdown-language/docs/<slug>`
 * en `target="_blank"` : RouterLink n'intercepte pas le clic → chargement dans
 * un nouvel onglet, la modale et le contexte d'édition restent en place
 * (aucune fermeture à câbler).
 */
@Component({
  selector: 'app-markdown-help-dialog',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './markdown-help-dialog.html',
  styleUrl: './markdown-help-dialog.scss',
})
export class MarkdownHelpDialog {
  /** viewChild sur un champ `protected` (jamais `#` — incompatibles). Ref
      nommée `dialogEl` et non `dialog` (une ref de template ne doit pas
      collisionner avec un signal du composant). */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  protected readonly language = inject(LanguageService);

  /** Exemples affichés dans des `<pre>` (chaînes liées : gardent les sauts). */
  protected readonly tableExample =
    '| Colonne A | Colonne B |\n| --------- | --------- |\n| valeur    | valeur    |';

  protected readonly mermaidExample =
    '```mermaid\ngraph TD\n  A[Début] --> B{Condition ?}\n  B -->|oui| C[Action]\n  B -->|non| D[Fin]\n```';

  protected readonly geogebraExample = '```geogebra\nid=RHYH3UQ8\nwidth=600\nheight=450\n```';

  protected readonly jsxgraphExample =
    '```jsxgraph\nequation=x^2 - 2\npoint=1,-1\nbbox=-5,5,5,-5\n```';

  open(): void {
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    this.dialog()?.nativeElement.close();
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }
}
