import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Taille du spinner ; mappée sur une variable CSS de diamètre. */
export type SpinnerSize = 'sm' | 'md' | 'lg';

/**
 * Indicateur de chargement du design system. Purement CSS (rotation),
 * SSR-safe (aucun accès `window`) et respectueux de `prefers-reduced-motion`
 * (repli statique via les tokens globaux). Le libellé sert aux lecteurs
 * d'écran (`role="status"`), masqué visuellement.
 */
@Component({
  selector: 'app-spinner',
  imports: [TranslocoPipe],
  templateUrl: './spinner.html',
  styleUrl: './spinner.scss',
  host: {
    '[class]': '"spinner spinner--" + size()',
    role: 'status',
    'aria-live': 'polite',
  },
})
export class Spinner {
  readonly size = input<SpinnerSize>('md');

  /** Libellé accessible ; par défaut « Chargement… » traduit. */
  readonly label = input<string>();
}
