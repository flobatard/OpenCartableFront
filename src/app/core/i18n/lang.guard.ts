import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { DEFAULT_LANG, isAppLang, LanguageService } from './language.service';

/**
 * Valide le segment `:lang`, active la langue et précharge ses traductions avant que la route
 * enfant ne rende. Une langue inconnue est renvoyée vers la home par défaut. S'exécute au
 * prerender/SSR comme au navigateur (source de vérité pour les navigations client fr↔en).
 */
export const langGuard: CanActivateFn = (route) => {
  const lang = route.paramMap.get('lang');
  if (!isAppLang(lang)) {
    return inject(Router).parseUrl(`/${DEFAULT_LANG}/home`);
  }
  inject(LanguageService).activate(lang);
  // load() est mis en cache : no-op au 1er passage (déjà chargé par l'app initializer).
  return inject(TranslocoService)
    .load(lang)
    .pipe(map(() => true));
};
