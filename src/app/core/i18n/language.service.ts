import { DOCUMENT, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getBrowserLang, TranslocoService } from '@jsverse/transloco';

export type AppLang = 'fr' | 'en';

export const APP_LANGS: readonly AppLang[] = ['fr', 'en'];

const STORAGE_KEY = 'oc-lang';

function isAppLang(value: unknown): value is AppLang {
  return value === 'fr' || value === 'en';
}

/** Langue de l'interface : persistée, défaut = langue du navigateur puis fr. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly #transloco = inject(TranslocoService);
  readonly #document = inject(DOCUMENT);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #lang = signal<AppLang>('fr');
  readonly lang = this.#lang.asReadonly();

  /** Restaure la langue persistée — ne fait rien au rendu serveur (rendu en fr). */
  init(): void {
    if (!this.#isBrowser) {
      return;
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // stockage indisponible : on retombe sur la langue du navigateur
    }
    const lang = isAppLang(stored) ? stored : this.#defaultLang();
    if (lang !== this.#lang()) {
      this.#activate(lang);
    }
  }

  setLang(lang: AppLang): void {
    this.#activate(lang);
    if (!this.#isBrowser) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // stockage indisponible : le choix vaut pour la page courante
    }
  }

  #activate(lang: AppLang): void {
    this.#lang.set(lang);
    this.#transloco.setActiveLang(lang);
    this.#document.documentElement.lang = lang;
  }

  #defaultLang(): AppLang {
    const browserLang = getBrowserLang();
    return isAppLang(browserLang) ? browserLang : 'fr';
  }
}
