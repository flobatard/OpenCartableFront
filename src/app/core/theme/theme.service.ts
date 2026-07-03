import { DOCUMENT, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'oc-theme';

/**
 * Thème clair/sombre via l'attribut `data-theme` sur <html>.
 * Le premier paint est géré par le script inline d'index.html (anti-FOUC) :
 * au bootstrap, le service lit l'attribut déjà posé au lieu de recalculer.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly #document = inject(DOCUMENT);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #theme = signal<Theme>('light');
  readonly theme = this.#theme.asReadonly();

  constructor() {
    if (!this.#isBrowser) {
      return;
    }
    const current = this.#document.documentElement.getAttribute('data-theme');
    this.#theme.set(current === 'dark' ? 'dark' : 'light');
    this.#followSystemIfNoPreference();
  }

  toggle(): void {
    this.set(this.#theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.#theme.set(theme);
    if (!this.#isBrowser) {
      return;
    }
    this.#apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // stockage indisponible (navigation privée) : le thème vaut pour la page courante
    }
  }

  #apply(theme: Theme): void {
    const root = this.#document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
  }

  /** Tant que l'utilisateur n'a pas choisi explicitement, suit le thème de l'OS. */
  #followSystemIfNoPreference(): void {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (stored === 'dark' || stored === 'light') {
      return;
    }
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      const theme: Theme = event.matches ? 'dark' : 'light';
      this.#theme.set(theme);
      this.#apply(theme);
    });
  }
}
