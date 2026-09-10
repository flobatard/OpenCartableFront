import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';
import { MarkdownView } from '../../markdown-view/markdown-view';

/**
 * Page de documentation du langage ```abc — montée par DocsShell (slug `abc`,
 * cf. ABC_EXTENSION.doc). Prose via i18n `docs.abc.*`.
 */
@Component({
  selector: 'app-abc-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './abc-doc.html',
})
export class AbcDoc {
  protected readonly firstExample =
    '```abc\nX:1\nT:Au clair de la lune\nM:4/4\nL:1/4\nK:C\nCCCD|E2D2|CEDD|C4|]\n```';

  protected readonly notesExample =
    '```abc\n' +
    'X:1\n' +
    'T:Frère Jacques\n' +
    'M:4/4\n' +
    'L:1/4\n' +
    'Q:1/4=100\n' +
    'K:F\n' +
    'FGAF|FGAF|ABc2|ABc2|\n' +
    'c/d/c/B/ AF|c/d/c/B/ AF|FCF2|FCF2|]\n' +
    '```';

  protected readonly chordsExample =
    '```abc\n' +
    'X:1\n' +
    'T:Ode à la joie\n' +
    'M:4/4\n' +
    'L:1/4\n' +
    'K:D\n' +
    '"D"FFGA|"A"AGFE|"D"DDEF|"A"F>E E2|\n' +
    '"D"FFGA|"A"AGFE|"D"DDEF|"A"E>D D2|]\n' +
    '```';

  protected readonly errorExample = '```abc\nX:1\nT:Sans notes\nK:C\n```';
}
