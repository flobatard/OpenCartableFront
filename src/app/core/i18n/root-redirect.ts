import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEFAULT_LANG, resolveStoredOrBrowserLang } from './language.service';

/**
 * Cible de redirection pour la racine `/`. Au navigateur, choisit la langue selon la préférence
 * persistée (`oc-lang`) puis la langue du navigateur ; côté serveur, retombe sur la langue par
 * défaut. La route `/` est rendue en mode Client, donc cette logique s'exécute au navigateur.
 */
export function rootLangRedirect(): string {
  const lang = isPlatformBrowser(inject(PLATFORM_ID)) ? resolveStoredOrBrowserLang() : DEFAULT_LANG;
  return `/${lang}/home`;
}
