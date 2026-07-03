import {
  ApplicationConfig,
  inject,
  PLATFORM_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformBrowser, PlatformLocation } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { MemoryStorage, OAuthStorage, provideOAuthClient } from 'angular-oauth2-oidc';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { TranslocoImportLoader } from './core/i18n/transloco-loader';
import { langFromPath, LanguageService } from './core/i18n/language.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    // withInterceptorsFromDi : l'intercepteur d'angular-oauth2-oidc (Bearer vers
    // l'API) est enregistré via le token legacy HTTP_INTERCEPTORS.
    provideHttpClient(withInterceptorsFromDi()),
    provideOAuthClient({
      resourceServer: {
        allowedUrls: [environment.apiUrl],
        sendAccessToken: true,
      },
    }),
    {
      // La session prof survit au redémarrage du navigateur ; storage inerte au SSR.
      provide: OAuthStorage,
      useFactory: () =>
        isPlatformBrowser(inject(PLATFORM_ID)) ? localStorage : new MemoryStorage(),
    },
    provideTransloco({
      config: {
        availableLangs: ['fr', 'en'],
        defaultLang: 'fr',
        fallbackLang: 'fr',
        // Sans ce réglage, fallbackLang ne couvre pas les clés manquantes :
        // une clé absente d'en.json rendrait la clé brute.
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoImportLoader,
    }),
    // Active la langue issue de l'URL AVANT le premier rendu, sur serveur ET client :
    // le HTML prerendered/SSR sort dans la bonne langue (sinon chaînes vides), et le
    // premier rendu client correspond au DOM serveur (pas de NG0500 sur header/footer).
    // On lit PlatformLocation.pathname car REQUEST vaut null au prerender ; PlatformLocation
    // reflète INITIAL_CONFIG.url au serveur et location au navigateur.
    provideAppInitializer(() => {
      const transloco = inject(TranslocoService);
      const lang = langFromPath(inject(PlatformLocation).pathname);
      inject(LanguageService).activate(lang);
      return firstValueFrom(transloco.load(lang));
    }),
  ],
};
