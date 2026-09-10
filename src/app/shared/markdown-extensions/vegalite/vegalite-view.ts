import { Component, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import DOMPurify from 'dompurify';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { parseVegaliteSpec, VegaliteSpec, withContainerWidth } from './vegalite-config';

type VegaRuntime = {
  readonly vega: typeof import('vega');
  readonly vegaLite: typeof import('vega-lite');
  readonly expressionInterpreter: unknown;
};

/** Erreur affichée : clé i18n `markdownExtensions.vegalite.<kind>` + détail brut. */
interface VegaliteError {
  readonly kind: 'json' | 'notObject' | 'externalData' | 'spec' | 'load';
  readonly detail: string;
}

/** Largeur prêtée au conteneur quand il n'a pas encore de mise en page (jsdom). */
const FALLBACK_WIDTH = 560;
/** Padding horizontal de la planche (cf. .vegalite-view__board). */
const BOARD_PADDING = 32;

let runtime: Promise<VegaRuntime> | null = null;

/** Imports mémoïsés (un échec est oublié : le prochain rendu retentera). */
function loadVegaRuntime(): Promise<VegaRuntime> {
  runtime ??= Promise.all([import('vega'), import('vega-lite'), import('vega-interpreter')])
    .then(([vega, vegaLite, interpreter]) => ({
      vega,
      vegaLite,
      expressionInterpreter: interpreter.expressionInterpreter,
    }))
    .catch((e: unknown) => {
      runtime = null;
      throw e;
    });
  return runtime;
}

/**
 * Rendu d'un fence ```vegalite : graphique Vega-Lite rendu en SVG STATIQUE
 * durci. Vega, Vega-Lite et l'interpréteur sont importés au premier rendu.
 *
 * - Expressions interprétées (`ast: true` + `vega-interpreter`) : jamais
 *   compilées en `new Function` — compatible avec une CSP sans `unsafe-eval`.
 * - Loader qui refuse tout : aucune requête réseau, aucune navigation (`href`
 *   supprimés) ; la spec est de toute façon refusée si elle porte une clé
 *   `url` (cf. vegalite-config).
 * - `renderer: 'none'` puis `toSVG()` : le SVG texte est re-sanitisé et posé
 *   sur la planche claire fixe (couleurs du thème Vega figées). Pas
 *   d'interactivité (info-bulles, sélections) : dette assumée.
 */
@Component({
  selector: 'app-vegalite-view',
  imports: [TranslocoPipe],
  templateUrl: './vegalite-view.html',
  styleUrl: './vegalite-view.scss',
})
export class VegaliteView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  protected readonly boardEl = viewChild<ElementRef<HTMLElement>>('board');
  protected readonly loading = signal(true);
  protected readonly error = signal<VegaliteError | null>(null);
  /** `description` (ou titre texte) de la spec, pour l'étiquette accessible. */
  protected readonly label = signal<string | null>(null);

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect((onCleanup) => {
      const source = this.source();
      const board = this.boardEl()?.nativeElement;
      if (board === undefined) {
        return;
      }
      let stale = false;
      onCleanup(() => {
        stale = true;
        board.replaceChildren();
      });
      void this.#draw(board, source, () => stale);
    });
  }

  async #draw(board: HTMLElement, source: string, isStale: () => boolean): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    const parsed = parseVegaliteSpec(source);
    if (!parsed.ok) {
      this.#fail({ kind: parsed.error, detail: parsed.detail });
      return;
    }
    this.label.set(specLabel(parsed.spec));

    let vg: VegaRuntime;
    try {
      vg = await loadVegaRuntime();
    } catch {
      if (!isStale()) {
        this.#fail({ kind: 'load', detail: '' });
      }
      return;
    }
    if (isStale()) {
      return;
    }

    try {
      const width = (this.#host.nativeElement.clientWidth || FALLBACK_WIDTH) - BOARD_PADDING;
      const svg = await renderSvg(vg, withContainerWidth(parsed.spec, width));
      if (isStale()) {
        return;
      }
      board.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });
      this.loading.set(false);
    } catch (e) {
      if (!isStale()) {
        this.#fail({ kind: 'spec', detail: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  #fail(error: VegaliteError): void {
    this.error.set(error);
    this.loading.set(false);
  }
}

/** Compile, exécute sans rendu ni réseau, et sérialise en SVG. */
async function renderSvg(vg: VegaRuntime, spec: VegaliteSpec): Promise<string> {
  const { vega, vegaLite } = vg;
  const silent = vega.logger(vega.None);
  // Spec contrôlée en forme (objet JSON, sans `url`) ; sa validité Vega-Lite
  // est vérifiée par `compile`, qui lève sur une spec incohérente.
  const topLevel = spec as unknown as Parameters<typeof vegaLite.compile>[0];
  const compiled = vegaLite.compile(topLevel, {
    logger: silent,
    config: { font: 'Inter, system-ui, sans-serif', background: 'transparent' },
  });
  const loader = vega.loader();
  const refuse = () => Promise.reject(new Error('Chargement externe refusé'));
  loader.load = refuse;
  loader.sanitize = refuse;
  const view = new vega.View(vega.parse(compiled.spec, undefined, { ast: true }), {
    renderer: 'none',
    loader,
    logger: silent,
    expr: vg.expressionInterpreter,
  });
  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}

function specLabel(spec: VegaliteSpec): string | null {
  const { description, title } = spec;
  if (typeof description === 'string' && description.trim() !== '') {
    return description;
  }
  return typeof title === 'string' && title.trim() !== '' ? title : null;
}
