import { DestroyRef, effect, inject, Signal, signal } from '@angular/core';

/**
 * Dévoilement progressif du texte streamé : un tick toutes les 40 ms
 * (≈ 25 rendus markdown/s — fluide à l'œil, sans saturer le thread principal)
 * qui rattrape une PART du retard accumulé, avec un plancher et un plafond de
 * caractères par tick. Les rafales du réseau ou du provider deviennent ainsi
 * un défilement régulier.
 */
export const STREAM_REVEAL_TICK_MS = 40;
const STREAM_REVEAL_CATCH_UP = 0.3;
const STREAM_REVEAL_MIN_CHARS = 3;
const STREAM_REVEAL_MAX_CHARS = 160;

/**
 * Signal du texte dévoilé, qui suit `source` (le texte streamé brut) tick
 * après tick ; une source vide (tour terminé) remet le rendu à zéro. `active`
 * suspend le suivi (ex. hôte en mode placeholder : la source n'est pas lue).
 * À créer dans un contexte d'injection — le timer est annulé à la destruction.
 */
export function progressiveReveal(
  source: () => string,
  active: () => boolean = () => true,
): Signal<string> {
  const shown = signal('');
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (): void => {
    if (timer !== null) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      step();
    }, STREAM_REVEAL_TICK_MS);
  };

  /** Un tick : avance vers le texte reçu, se replanifie s'il reste du retard. */
  const step = (): void => {
    const target = source();
    const current = shown();
    const base = target.startsWith(current) ? current.length : 0;
    const backlog = target.length - base;
    if (backlog <= 0) {
      return;
    }
    const chunk = Math.min(
      backlog,
      Math.max(
        STREAM_REVEAL_MIN_CHARS,
        Math.min(STREAM_REVEAL_MAX_CHARS, Math.ceil(backlog * STREAM_REVEAL_CATCH_UP)),
      ),
    );
    shown.set(target.slice(0, base + chunk));
    if (base + chunk < target.length) {
      schedule();
    }
  };

  // Chaque delta reçu (re)lance le tick, qui se replanifie tant qu'il reste du
  // retard à rattraper.
  effect(() => {
    if (!active()) {
      return;
    }
    if (!source()) {
      cancel();
      shown.set('');
      return;
    }
    schedule();
  });
  inject(DestroyRef).onDestroy(cancel);

  return shown.asReadonly();
}
