import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';

@Component({
  selector: 'app-tikz-doc',
  imports: [MarkdownPlayground, TranslocoPipe],
  templateUrl: './tikz-doc.html',
})
export class TikzDoc {
  protected readonly firstExample = '```tikz\n\\draw (0,0) -- (4,0) -- (0,3) -- cycle;\n```';

  protected readonly configExample = 
    '```tikz\n\\begin{tikzpicture}[scale=1.5]\n  \\draw[fill=blue!20] (0,0) circle (1cm);\n\\end{tikzpicture}\n```';
}