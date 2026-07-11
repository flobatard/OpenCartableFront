import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';
import { MarkdownView } from '../../markdown-view/markdown-view';

/**
 * Page de documentation du langage ```geogebra — montée par DocsShell (slug
 * `geogebra`, cf. GEOGEBRA_EXTENSION.doc). Prose via i18n `docs.geogebra.*`.
 * Le matériel d'exemple RHYH3UQ8 est public (« Expanding square »).
 */
@Component({
  selector: 'app-geogebra-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './geogebra-doc.html',
})
export class GeogebraDoc {
  protected readonly firstExample = '```geogebra\nid=RHYH3UQ8\nwidth=700\nheight=450\n```';

  protected readonly invalidExample = '```geogebra\nid=https://www.geogebra.org/m/RHYH3UQ8\n```';
}
