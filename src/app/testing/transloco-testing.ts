import { TranslocoTestingModule } from '@jsverse/transloco';
import fr from '../i18n/fr';
import en from '../i18n/en';

/** Module Transloco de test : traductions réelles préchargées, rendu synchrone. */
export function provideTranslocoTesting() {
  return TranslocoTestingModule.forRoot({
    langs: { fr, en },
    translocoConfig: {
      availableLangs: ['fr', 'en'],
      defaultLang: 'fr',
      fallbackLang: 'fr',
      reRenderOnLangChange: true,
    },
    preloadLangs: true,
  });
}
