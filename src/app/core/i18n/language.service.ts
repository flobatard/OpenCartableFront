import { DOCUMENT, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { getBrowserLang, TranslocoService } from '@jsverse/transloco';

export type AppLang = 'fr' | 'en';

export const APP_LANGS: readonly AppLang[] = ['fr', 'en'];

export const DEFAULT_LANG: AppLang = 'fr';

const STORAGE_KEY = 'oc-lang';

export function isAppLang(value: unknown): value is AppLang {
  return value === 'fr' || value === 'en';
}

/** Langue portée par l'URL : 1er segment de chemin (`/en/home` → `en`), sinon défaut. */
export function langFromPath(pathname: string): AppLang {
  const segment = pathname.split('/').filter(Boolean)[0];
  return isAppLang(segment) ? segment : DEFAULT_LANG;
}

/**
 * Préférence de langue résolue côté navigateur : choix persisté (`oc-lang`), sinon langue du
 * navigateur, sinon défaut. À n'appeler qu'au navigateur (lecture localStorage + navigator).
 */
export function resolveStoredOrBrowserLang(): AppLang {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // stockage indisponible : on retombe sur la langue du navigateur
  }
  if (isAppLang(stored)) {
    return stored;
  }
  const browserLang = getBrowserLang();
  return isAppLang(browserLang) ? browserLang : DEFAULT_LANG;
}

/** Langue de l'interface : dérivée de l'URL, mémorisée pour la redirection racine `/`. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly #transloco = inject(TranslocoService);
  readonly #document = inject(DOCUMENT);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #lang = signal<AppLang>(DEFAULT_LANG);
  readonly lang = this.#lang.asReadonly();

  /** Active la langue : signal + langue transloco + attribut `<html lang>`. Idempotent. */
  activate(lang: AppLang): void {
    this.#lang.set(lang);
    if (this.#transloco.getActiveLang() !== lang) {
      this.#transloco.setActiveLang(lang);
    }
    this.#document.documentElement.lang = lang;
  }

  /** Mémorise le choix puis navigue vers la même page dans l'autre langue (le guard active). */
  switchTo(lang: AppLang): void {
    this.persist(lang);
    const path = this.#router.url.split(/[?#]/)[0];
    const segments = path.split('/').filter(Boolean);
    if (isAppLang(segments[0])) {
      segments[0] = lang;
    } else {
      segments.unshift(lang);
    }
    if (segments.length === 1) {
      segments.push('home');
    }
    void this.#router.navigate(['/', ...segments]);
  }

  /** Persiste la préférence de langue (navigateur only), lue par la redirection racine `/`. */
  persist(lang: AppLang): void {
    if (!this.#isBrowser) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // stockage indisponible : le choix vaut pour la page courante
    }
  }
}
