import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { parseTimelineConfig } from './timeline-config';
import { layoutTimeline, TIMELINE_MIN_WIDTH, TIMELINE_WIDTH } from './timeline-layout';

/**
 * Rendu d'un fence ```timeline : frise chronologique en SVG, dessinée par le
 * template (aucune lib, aucun `innerHTML` — rien à sanitiser). Les couleurs
 * passent par les tokens : thème sombre natif, et l'impression, qui force les
 * tokens clairs, clone le SVG tel quel. Le SVG est une image pour les
 * technologies d'assistance ; une liste masquée en restitue le contenu.
 *
 * Le `viewBox` épouse la largeur mesurée de l'hôte (1 unité = 1 px) : le texte
 * garde sa taille quelle que soit la colonne ; sous `TIMELINE_MIN_WIDTH`, le
 * conteneur défile.
 */
@Component({
  selector: 'app-timeline-view',
  imports: [NgTemplateOutlet, TranslocoPipe],
  templateUrl: './timeline-view.html',
  styleUrl: './timeline-view.scss',
})
export class TimelineView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #width = signal(TIMELINE_WIDTH);

  protected readonly config = computed(() => parseTimelineConfig(this.source()));
  protected readonly layout = computed(() => layoutTimeline(this.config(), this.#width()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const host = this.#host.nativeElement;
      const measure = () => {
        if (host.clientWidth > 0) {
          this.#width.set(Math.max(TIMELINE_MIN_WIDTH, Math.round(host.clientWidth)));
        }
      };
      measure();
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(measure);
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
