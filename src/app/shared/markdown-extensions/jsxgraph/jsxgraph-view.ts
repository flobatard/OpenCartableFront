import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { parseJsxgraphConfig } from './jsxgraph-config';

/**
 * Espace de noms JXG. Le paquet déclare ses types en `export =` mais son entrée
 * ESM fait un `export default JXG` : à l'import dynamique on prend `default`
 * s'il existe, sinon le module lui-même.
 */
type Jxg = typeof import('jsxgraph');
type Board = import('jsxgraph').Board;

async function loadJxg(): Promise<Jxg> {
  const mod: unknown = await import('jsxgraph');
  const withDefault = mod as { default?: Jxg };
  return withDefault.default ?? (mod as Jxg);
}

/**
 * Rendu d'un fence ```jsxgraph : courbes et points tracés en SVG par JSXGraph.
 * Monté dynamiquement par `markdown-view` (contrat MarkdownExtensionComponent).
 * La lib est importée dynamiquement au premier tracé (hors bundle initial) ;
 * les équations passent par JessieCode (`board.jc.snippet`), le parseur math
 * sandboxé de JSXGraph — jamais `eval`/`new Function`. Toute erreur (import,
 * équation invalide) affiche une notice, jamais d'exception.
 */
@Component({
  selector: 'app-jsxgraph-view',
  imports: [TranslocoPipe],
  templateUrl: './jsxgraph-view.html',
  styleUrl: './jsxgraph-view.scss',
})
export class JsxgraphView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  /** Conteneur du board — protected, jamais `#` (piège viewChild documenté). */
  protected readonly boardEl = viewChild<ElementRef<HTMLElement>>('board');

  protected readonly error = signal(false);

  #jxg: Jxg | null = null;
  #board: Board | null = null;

  constructor() {
    // Tracé : re-court quand la source ou le conteneur change. Le travail est
    // async (import lazy) → stale-guard au patron markdown-view.
    effect((onCleanup) => {
      const source = this.source();
      const el = this.boardEl()?.nativeElement;
      if (el === undefined) {
        return;
      }
      let stale = false;
      onCleanup(() => (stale = true));
      void this.#draw(el, source, () => stale);
    });
    // Remontages fréquents (réécritures d'innerHTML de l'hôte) : sans
    // libération, JSXGraph accumule boards et listeners.
    inject(DestroyRef).onDestroy(() => this.#freeBoard());
  }

  async #draw(el: HTMLElement, source: string, isStale: () => boolean): Promise<void> {
    try {
      const JXG = (this.#jxg ??= await loadJxg());
      if (isStale()) {
        return;
      }
      this.#freeBoard();
      this.error.set(false);
      const config = parseJsxgraphConfig(source);
      const board = JXG.JSXGraph.initBoard(el, {
        boundingbox: [...config.boundingBox],
        axis: true,
        showNavigation: false,
        showCopyright: false,
        keepAspectRatio: false,
      });
      this.#board = board;
      for (const equation of config.equations) {
        // JessieCode : parseur sandboxé, l'équation devient une fonction de x.
        const f = board.jc.snippet(equation, true, 'x', true);
        board.create('functiongraph', [f as (x: number) => number]);
      }
      for (const [x, y] of config.points) {
        board.create('point', [x, y], { fixed: true });
      }
    } catch {
      if (!isStale()) {
        this.error.set(true);
      }
    }
  }

  #freeBoard(): void {
    if (this.#jxg !== null && this.#board !== null) {
      this.#jxg.JSXGraph.freeBoard(this.#board);
      this.#board = null;
    }
  }
}
