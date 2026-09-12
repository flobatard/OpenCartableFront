import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CALLOUT_KINDS } from '../../core/markdown/course-callouts';
import { LanguageService } from '../../core/i18n/language.service';
import { NativeDialog } from '../dialog/native-dialog.directive';

/**
 * Modale d'aide à la mise en forme (markdown et encadrés + LaTeX/KaTeX et mhchem + Mermaid +
 * extensions GeoGebra/JSXGraph/TikZ/frise/SMILES/Vega-Lite/ABC/SQL/Python/passage), réutilisable par tout éditeur de
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

  /**
   * Les six types d'encadré, dans l'ordre de la documentation : marqueur
   * canonique et clé du titre par défaut — celui-là même qu'affiche le rendu
   * (`markdownView.callouts.*`, la source des titres de `renderCourseMarkdown`).
   */
  protected readonly calloutKinds = CALLOUT_KINDS.map((kind) => ({
    marker: `[!${kind.toUpperCase()}]`,
    titleKey: `markdownView.callouts.${kind}`,
  }));

  protected readonly calloutExample =
    '> [!DEFINITION]\n> Une fonction affine s’écrit $f(x) = ax + b$.\n\n' +
    '> [!WARNING] Titre libre\n> Le texte après le marqueur remplace le titre.';

  protected readonly mhchemExample = '$\\ce{2H2 + O2 -> 2H2O}$\n$\\pu{9.81 m.s^-2}$';

  protected readonly mermaidExample =
    '```mermaid\ngraph TD\n  A[Début] --> B{Condition ?}\n  B -->|oui| C[Action]\n  B -->|non| D[Fin]\n```';

  protected readonly geogebraExample = '```geogebra\nid=RHYH3UQ8\nwidth=600\nheight=450\n```';

  protected readonly jsxgraphExample =
    '```jsxgraph\nequation=x^2 - 2\npoint=1,-1\nbbox=-5,5,5,-5\n```';

  protected readonly tikzExample = '```tikz\n\\draw (0,0) -- (4,0) -- (0,3) -- cycle;\n```';

  protected readonly timelineExample =
    '```timeline\nperiod=1789,1799,Révolution\nevent=1789-07-14,Prise de la Bastille\n```';

  protected readonly smilesExample = '```smiles\nCCO | Éthanol\nc1ccccc1 | Benzène\n```';

  protected readonly vegaliteExample =
    '```vegalite\n{\n  "data": {"values": [{"x": "A", "y": 3}, {"x": "B", "y": 5}]},\n' +
    '  "mark": "bar",\n' +
    '  "encoding": {\n    "x": {"field": "x", "type": "nominal"},\n' +
    '    "y": {"field": "y", "type": "quantitative"}\n  }\n}\n```';

  protected readonly abcExample = '```abc\nX:1\nT:Au clair de la lune\nL:1/4\nK:C\nCCCD|E2D2|CEDD|C4|]\n```';

  protected readonly sqlExample =
    "```sql\nCREATE TABLE ville (nom TEXT, habitants INTEGER);\n" +
    "INSERT INTO ville VALUES ('Paris', 2100000), ('Lyon', 520000);\n" +
    '-- @query\nSELECT nom FROM ville WHERE habitants > 1000000;\n```';

  protected readonly pythonExample =
    '```python\nfor i in range(1, 4):\n    print(i, "au carré vaut", i ** 2)\n```';

  protected readonly passageExample =
    '```passage\nDemain, dès l’aube, à l’heure où blanchit la campagne,\n' +
    'Je partirai. Vois-tu, je sais que tu m’attends.\n…\n```';

  open(): void {
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
  }
}
