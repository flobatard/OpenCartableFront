import { Injectable } from '@angular/core';

/**
 * Une seule partition joue à la fois dans la page : lancer une lecture
 * arrête la précédente (deux mélodies superposées ne servent à rien).
 * Singleton root — les vues ABC sont remontées à chaque rendu du markdown,
 * seul un service survit pour tenir le lecteur courant.
 */
@Injectable({ providedIn: 'root' })
export class AbcPlayback {
  #stopCurrent: (() => void) | null = null;

  /** Déclare un nouveau lecteur actif ; arrête celui qui jouait. */
  claim(stop: () => void): void {
    if (this.#stopCurrent !== null && this.#stopCurrent !== stop) {
      this.#stopCurrent();
    }
    this.#stopCurrent = stop;
  }

  /** Le lecteur s'est arrêté de lui-même (fin, erreur, destruction). */
  release(stop: () => void): void {
    if (this.#stopCurrent === stop) {
      this.#stopCurrent = null;
    }
  }
}
