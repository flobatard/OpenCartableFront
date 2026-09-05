import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { NativeDialog } from '../dialog/native-dialog.directive';

/**
 * Modale d'aide à la mise en forme (markdown + LaTeX/KaTeX + Mermaid +
 * extensions GeoGebra/JSXGraph/TikZ), réutilisable par tout éditeur de
 * contenu de cours. Élément `<dialog>` natif : focus-trap, Escape et backdrop gérés par
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
  imports: [NativeDialog, RouterLink, TranslocoPipe],
  templateUrl: './markdown-help-dialog.html',
  styleUrl: './markdown-help-dialog.scss',
})
export class MarkdownHelpDialog {
  protected readonly dialog = viewChild(NativeDialog);

  protected readonly language = inject(LanguageService);

  /** Exemples affichés dans des `<pre>` (chaînes liées : gardent les sauts). */
  protected readonly tableExample =
    '| Colonne A | Colonne B |\n| --------- | --------- |\n| valeur    | valeur    |';

  protected readonly mermaidExample =
    '```mermaid\ngraph TD\n  A[Début] --> B{Condition ?}\n  B -->|oui| C[Action]\n  B -->|non| D[Fin]\n```';

  protected readonly geogebraExample = '```geogebra\nid=RHYH3UQ8\nwidth=600\nheight=450\n```';

  protected readonly jsxgraphExample =
    '```jsxgraph\nequation=x^2 - 2\npoint=1,-1\nbbox=-5,5,5,-5\n```';

  protected readonly tikzExample = '```tikz\n\\draw (0,0) -- (4,0) -- (0,3) -- cycle;\n```';

  open(): void {
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
  }
}
