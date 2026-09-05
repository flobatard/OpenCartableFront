import { Signal, signal } from '@angular/core';

/**
 * Action « en deux temps » sans modale : le premier appel **arme** (le bouton
 * affiche « Confirmer »), le second sur la même clé **confirme** ; quitter le
 * bouton (blur) désarme. Une seule action armée à la fois par instance.
 *
 * `K` est la clé de l'élément visé (id, index, `'*'` pour « tout ») ; une
 * action sans cible utilise `true`.
 */
export interface ArmedAction<K> {
  /** Clé actuellement armée, `null` sinon. */
  readonly armed: Signal<K | null>;
  /**
   * Premier appel sur `key` : arme et rend `false` (rien à faire) ; second
   * appel sur la même clé : désarme et rend `true` (l'appelant exécute).
   */
  confirm(key: K): boolean;
  isArmed(key: K): boolean;
  disarm(): void;
}

export function armedAction<K = true>(): ArmedAction<K> {
  const armed = signal<K | null>(null);
  return {
    armed: armed.asReadonly(),
    confirm(key: K): boolean {
      if (armed() === key) {
        armed.set(null);
        return true;
      }
      armed.set(key);
      return false;
    },
    isArmed(key: K): boolean {
      return armed() === key;
    },
    disarm(): void {
      armed.set(null);
    },
  };
}
