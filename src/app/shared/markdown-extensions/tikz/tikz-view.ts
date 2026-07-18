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
import { parseTikzConfig } from './tikz-config';

/**
 * Chargeur asynchrone pour TikZJax (@drgrice1/tikzjax, fork maintenu — le
 * paquet `tikzjax` d'origine est dépublié). Mémoïsé au niveau module : un
 * seul <script> est jamais injecté, même si plusieurs vues se montent avant
 * la fin du chargement. Contrairement à l'implémentation d'origine, ce fork
 * initialise son MutationObserver dès que `document.readyState==='complete'`
 * (toujours vrai ici, chargé bien après le premier rendu) et il observe tout
 * le `<body>` en profondeur : aucun événement DOMContentLoaded à rejouer, un
 * `<script type="text/tikz">` inséré n'importe où dans le DOM est détecté.
 */
let tikzJaxPromise: Promise<void> | null = null;

function loadTikzJax(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  return (tikzJaxPromise ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/tikzjax/fonts.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.id = 'tikzjax-script';
    script.src = '/assets/tikzjax/tikzjax.js';
    script.onload = () => resolve();
    script.onerror = () => {
      // Autorise une nouvelle tentative au prochain montage (échec réseau ponctuel).
      tikzJaxPromise = null;
      reject(new Error('Erreur de chargement TikZJax local'));
    };
    document.head.appendChild(script);
  }));
}

@Component({
  selector: 'app-tikz-view',
  imports: [TranslocoPipe],
  templateUrl: './tikz-view.html',
  styleUrl: './tikz-view.scss',
})
export class TikzView implements MarkdownExtensionComponent {
  readonly source = input.required<string>();

  protected readonly containerEl = viewChild<ElementRef<HTMLElement>>('container');
  protected readonly error = signal(false);
  protected readonly loading = signal(true);

  constructor() {
    effect((onCleanup) => {
      const source = this.source();
      const el = this.containerEl()?.nativeElement;
      if (!el) return;

      let stale = false;
      onCleanup(() => {
        stale = true;
        el.innerHTML = ''; // Nettoyage du DOM au démontage ou update
      });

      void this.#draw(el, source, () => stale);
    });
  }

  async #draw(el: HTMLElement, source: string, isStale: () => boolean): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(false);

      await loadTikzJax();
      if (isStale()) return;

      const code = parseTikzConfig(source);
      
      // TikZJax parse automatiquement les balises <script type="text/tikz"> 
      // lorsqu'elles sont insérées dans le DOM (grâce à son MutationObserver interne).
      const script = document.createElement('script');
      script.type = 'text/tikz';
      script.textContent = code;
      
      el.innerHTML = '';
      el.appendChild(script);
      
      // L'événement 'tikzjax-load-finished' est émis sur le document quand SVG est prêt
      // Note: selon l'usage, on pourrait écouter cet event pour masquer le `loading`, 
      // mais le script remplace la balise par le SVG de façon synchrone vis-à-vis de l'UI.
      this.loading.set(false);
      
    } catch {
      if (!isStale()) {
        this.error.set(true);
        this.loading.set(false);
      }
    }
  }
}