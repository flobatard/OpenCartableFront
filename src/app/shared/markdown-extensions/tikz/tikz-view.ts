import { Component, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import DOMPurify from 'dompurify';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { parseTikzConfig } from './tikz-config';
import { TikzJaxLoader } from './tikzjax-loader';

/**
 * Rendu d'un fence ```tikz : le code LaTeX/TikZ est compilé en SVG dans le
 * navigateur par TikZJax (worker + WASM, aucun service externe). Monté
 * dynamiquement par `markdown-view` (contrat MarkdownExtensionComponent).
 *
 * Cycle observé (vérifié dans le source du fork) : le <script type="text/tikz">
 * inséré ici est détecté par le MutationObserver global de TikZJax, remplacé
 * par un spinner <svg> intermédiaire, puis :
 * - succès → le SVG compilé, et un événement `tikzjax-load-finished` qui bulle
 *   depuis le nœud (seul signal fiable de fin — le spinner étant lui-même un
 *   <svg>, « un svg est apparu » ne suffit pas) ;
 * - code TeX invalide → une <img> à URL volontairement invalide, SANS
 *   événement (le fork se contente d'un console.log) : l'échec se détecte à
 *   la forme du DOM, via notre propre MutationObserver sur le conteneur.
 */
@Component({
  selector: 'app-tikz-view',
  imports: [TranslocoPipe],
  templateUrl: './tikz-view.html',
  styleUrl: './tikz-view.scss',
})
export class TikzView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  /** Conteneur du rendu — protected, jamais `#` (piège viewChild documenté). */
  protected readonly containerEl = viewChild<ElementRef<HTMLElement>>('container');

  protected readonly loading = signal(true);
  /** `'load'` : TikZJax n'a pas pu être chargé ; `'tex'` : code TikZ invalide. */
  protected readonly error = signal<'load' | 'tex' | null>(null);

  readonly #loader = inject(TikzJaxLoader);

  constructor() {
    // Compilation : re-court quand la source ou le conteneur change. Le
    // travail est async (chargement lazy) → stale-guard au patron markdown-view.
    effect((onCleanup) => {
      const source = this.source();
      const el = this.containerEl()?.nativeElement;
      if (el === undefined) {
        return;
      }

      let stale = false;
      const observer = new MutationObserver(() => this.#onTexFailure(el, observer));
      const onFinished = () => this.#onRendered(el, observer);
      el.addEventListener('tikzjax-load-finished', onFinished);

      onCleanup(() => {
        stale = true;
        observer.disconnect();
        el.removeEventListener('tikzjax-load-finished', onFinished);
        el.innerHTML = ''; // Nettoyage du DOM au démontage ou changement de source
      });

      void this.#draw(el, source, observer, () => stale);
    });
  }

  async #draw(
    el: HTMLElement,
    source: string,
    observer: MutationObserver,
    isStale: () => boolean,
  ): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      await this.#loader.load();
      if (isStale()) {
        return;
      }

      const script = document.createElement('script');
      script.type = 'text/tikz';
      script.textContent = parseTikzConfig(source);

      el.innerHTML = '';
      observer.observe(el, { childList: true, subtree: true });
      el.appendChild(script);
    } catch {
      if (!isStale()) {
        this.error.set('load');
        this.loading.set(false);
      }
    }
  }

  /** Succès : `tikzjax-load-finished` a bullé depuis le SVG compilé. */
  #onRendered(el: HTMLElement, observer: MutationObserver): void {
    observer.disconnect();
    // Défense en profondeur : ce SVG sort de dvi2html et est injecté par
    // TikZJax APRÈS la sanitisation de core/markdown (les \special{} DVI
    // peuvent véhiculer du brut) — on le re-filtre ici, exception assumée à
    // l'invariant « la sanitisation vit dans core/markdown ».
    el.innerHTML = DOMPurify.sanitize(el.innerHTML, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
    this.loading.set(false);
  }

  /** Échec TeX : TikZJax a posé son <img> d'erreur (aucun événement émis). */
  #onTexFailure(el: HTMLElement, observer: MutationObserver): void {
    if (el.querySelector('img') === null) {
      return; // spinner ou SVG final : rien à faire ici
    }
    observer.disconnect();
    el.innerHTML = ''; // l'<img> du fork pointe une URL volontairement invalide
    this.error.set('tex');
    this.loading.set(false);
  }
}
