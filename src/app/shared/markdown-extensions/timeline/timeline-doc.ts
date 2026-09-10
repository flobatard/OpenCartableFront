import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';
import { MarkdownView } from '../../markdown-view/markdown-view';

/**
 * Page de documentation du langage ```timeline — montée par DocsShell (slug
 * `timeline`, cf. TIMELINE_EXTENSION.doc). Prose via i18n `docs.timeline.*`.
 */
@Component({
  selector: 'app-timeline-doc',
  imports: [MarkdownPlayground, MarkdownView, TranslocoPipe],
  templateUrl: './timeline-doc.html',
})
export class TimelineDoc {
  protected readonly firstExample =
    '```timeline\n' +
    'period=-800,476,Antiquité\n' +
    'period=476,1492,Moyen Âge\n' +
    'period=1492,1789,Temps modernes\n' +
    'period=1789,2025,Époque contemporaine\n' +
    '```';

  protected readonly eventsExample =
    '```timeline\n' +
    'period=1789,1799,Révolution\n' +
    'period=1804,1815,Premier Empire\n' +
    'event=1789-07-14,Prise de la Bastille\n' +
    'event=1792-09-21,Abolition de la monarchie\n' +
    'event=1799-11-09,Coup d’État de Bonaparte\n' +
    'event=1804-12-02,Sacre de Napoléon\n' +
    'event=1815-06-18,Waterloo\n' +
    '```';

  protected readonly boundsExample =
    '```timeline\n' +
    'start=1900\n' +
    'end=2000\n' +
    'step=10\n' +
    'period=1914,1918,Première Guerre mondiale\n' +
    'period=1939,1945,Seconde Guerre mondiale\n' +
    'event=1957,Traité de Rome\n' +
    'event=1989-11-09,Chute du mur de Berlin\n' +
    '```';

  protected readonly bceExample =
    '```timeline\n' +
    'event=-3200,Invention de l’écriture\n' +
    'event=-776,Premiers Jeux olympiques\n' +
    'event=-52,Alésia\n' +
    'event=476,Chute de Rome\n' +
    '```';

  protected readonly errorExample =
    '```timeline\n' +
    'event=1789,Révolution française\n' +
    'event=vers 1500,Date floue\n' +
    'period=1914,Première Guerre mondiale\n' +
    '```';
}
