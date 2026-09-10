import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';
import { MarkdownView } from '../../markdown-view/markdown-view';

/**
 * Page de documentation du langage ```smiles — montée par DocsShell (slug
 * `smiles`, cf. SMILES_EXTENSION.doc). Prose via i18n `docs.smiles.*`.
 */
@Component({
  selector: 'app-smiles-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './smiles-doc.html',
})
export class SmilesDoc {
  protected readonly firstExample = '```smiles\nCCO | Éthanol\n```';

  protected readonly syntaxExample =
    '```smiles\n' +
    'CC(=O)O | Acide éthanoïque\n' +
    'C=C | Éthène\n' +
    'C#C | Éthyne\n' +
    'CC(C)O | Propan-2-ol\n' +
    '```';

  protected readonly ringsExample =
    '```smiles\n' +
    'C1CCCCC1 | Cyclohexane\n' +
    'c1ccccc1 | Benzène\n' +
    'CN1C=NC2=C1C(=O)N(C(=O)N2C)C | Caféine\n' +
    '```';

  protected readonly ionsExample =
    '```smiles\n' +
    '[NH4+] | Ion ammonium\n' +
    'CC(=O)[O-] | Ion éthanoate\n' +
    '[Na+].[Cl-] | Chlorure de sodium\n' +
    '```';

  protected readonly errorExample =
    '```smiles\nC1CC( | Parenthèse non fermée\nCCO | Éthanol\n```';
}
