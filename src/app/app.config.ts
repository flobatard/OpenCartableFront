import {
  ApplicationConfig,
  inject,
  PLATFORM_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { MemoryStorage, OAuthStorage, provideOAuthClient } from 'angular-oauth2-oidc';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { TranslocoImportLoader } from './core/i18n/transloco-loader';

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
    // Précharge la langue par défaut avant le premier rendu : sans cela, le HTML
    // prerendered/SSR sortirait avec des chaînes vides — le pipe transloco rend ''
    // tant que le JSON n'est pas chargé. La langue persistée de l'utilisateur est
    // restaurée APRÈS l'hydratation (cf. App), pour que le premier rendu client
    // corresponde au DOM serveur (pas de NG0500).
    provideAppInitializer(() => {
      const transloco = inject(TranslocoService);
      return firstValueFrom(transloco.load(transloco.getActiveLang()));
    }),
  ],
};
