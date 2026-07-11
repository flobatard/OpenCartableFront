import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';
import { MarkdownView } from '../../markdown-view/markdown-view';

/**
 * Page de documentation du langage ```jsxgraph — montée par DocsShell (slug
 * `jsxgraph`, cf. JSXGRAPH_EXTENSION.doc). Prose via i18n `docs.jsxgraph.*`.
 */
@Component({
  selector: 'app-jsxgraph-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './jsxgraph-doc.html',
})
export class JsxgraphDoc {
  protected readonly firstExample = '```jsxgraph\nequation=x^2 - 2\n```';

  protected readonly syntaxExample =
    '```jsxgraph\nequation=sin(x)\nequation=exp(-x^2/2)\nbbox=-6,2,6,-2\n```';

  protected readonly multipleExample =
    '```jsxgraph\nequation=x^2 - 2\nequation=2*x + 1\npoint=3,7\npoint=-1,-1\npoint=1,-1\n```';

  protected readonly bboxExample = '```jsxgraph\nequation=sqrt(x)\nbbox=0,4,10,-1\n```';

  protected readonly errorExample = '```jsxgraph\nequation=x^^2\n```';
}
