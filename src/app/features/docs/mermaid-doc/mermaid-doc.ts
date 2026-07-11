import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../../shared/markdown-playground/markdown-playground';
import { MarkdownView } from '../../../shared/markdown-view/markdown-view';

/**
 * Page de documentation des diagrammes Mermaid — montée par DocsShell (slug
 * `mermaid`). Prose via i18n `docs.mermaid.*`, exemples en constantes non
 * traduites. Client-only (playgrounds Monaco + rendu mermaid).
 */
@Component({
  selector: 'app-mermaid-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './mermaid-doc.html',
})
export class MermaidDoc {
  protected readonly flowchartExample =
    '```mermaid\n' +
    'graph TD\n' +
    '  A[Départ] --> B{Discriminant ?}\n' +
    '  B -->|positif| C[Deux racines]\n' +
    '  B -->|nul| D[Racine double]\n' +
    '  B -->|négatif| E[Aucune racine réelle]\n' +
    '```';

  protected readonly sequenceExample =
    '```mermaid\n' +
    'sequenceDiagram\n' +
    '  participant E as Élève\n' +
    '  participant P as Prof\n' +
    '  E->>P: Question\n' +
    '  P-->>E: Indice\n' +
    '  E->>P: Réponse\n' +
    '```';

  protected readonly classExample =
    '```mermaid\n' +
    'classDiagram\n' +
    '  class Polygone {\n' +
    '    +int cotes\n' +
    '    +perimetre()\n' +
    '  }\n' +
    '  Polygone <|-- Triangle\n' +
    '  Polygone <|-- Carre\n' +
    '```';

  protected readonly stateExample =
    '```mermaid\n' +
    'stateDiagram-v2\n' +
    '  [*] --> Brouillon\n' +
    '  Brouillon --> Publie : partager\n' +
    '  Publie --> Brouillon : retirer\n' +
    '  Publie --> [*]\n' +
    '```';

  protected readonly pieExample =
    '```mermaid\n' +
    'pie title Répartition du temps\n' +
    '  "Cours" : 45\n' +
    '  "Exercices" : 35\n' +
    '  "Évaluation" : 20\n' +
    '```';

  protected readonly ganttExample =
    '```mermaid\n' +
    'gantt\n' +
    '  title Séquence pédagogique\n' +
    '  dateFormat YYYY-MM-DD\n' +
    '  section Chapitre 1\n' +
    '  Cours : a1, 2026-09-01, 7d\n' +
    '  Exercices : after a1, 5d\n' +
    '```';

  protected readonly mathLimitExample =
    'La courbe de $f(x) = x^2$ :\n' +
    '\n' +
    '```mermaid\n' +
    'graph LR\n' +
    '  A[$x^2$] --> B[Le LaTeX ne rend pas ici]\n' +
    '```';

  protected readonly errorExample = '```mermaid\ngraph TD\n  A -->\n```';
}
