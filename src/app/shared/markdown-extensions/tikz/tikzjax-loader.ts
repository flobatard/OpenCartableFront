import { Injectable } from '@angular/core';

/**
 * Chargeur du runtime TikZJax (@drgrice1/tikzjax, fork maintenu — le paquet
 * `tikzjax` d'origine est dépublié), servi depuis les assets copiés par
 * angular.json (`/assets/tikzjax` ; le script résout lui-même son worker
 * `run-tex.js` et le wasm depuis sa propre URL). Service injectable plutôt
 * que fonction module : `vi.mock` est interdit sur les imports relatifs par
 * le builder de test Angular, la couture de test passe par le TestBed.
 *
 * Promesse mémoïsée (singleton root) : un seul <script> est injecté, même si
 * plusieurs vues se montent avant la fin du chargement. Contrairement à
 * l'implémentation d'origine, ce fork initialise son MutationObserver dès que
 * `document.readyState === 'complete'` (toujours vrai ici, chargé bien après
 * le premier rendu) et il observe tout le <body> en profondeur : un
 * <script type="text/tikz"> inséré n'importe où dans le DOM est compilé.
 */
@Injectable({ providedIn: 'root' })
export class TikzJaxLoader {
  #promise: Promise<void> | null = null;

  load(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();

    return (this.#promise ??= new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/tikzjax/fonts.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.id = 'tikzjax-script';
      script.src = '/assets/tikzjax/tikzjax.js';
      script.onload = () => resolve();
      script.onerror = () => {
        // Autorise une nouvelle tentative au prochain montage (échec réseau
        // ponctuel) sans laisser traîner les nœuds de la tentative ratée.
        this.#promise = null;
        link.remove();
        script.remove();
        reject(new Error('Erreur de chargement TikZJax local'));
      };
      document.head.appendChild(script);
    }));
  }
}
