import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Loader par import() dynamique : les JSON sont bundlés (chunks lazy) dans les
 * builds navigateur ET serveur. Contrairement au loader HTTP, il fonctionne au
 * prerender, où aucun serveur ne peut répondre à une URL relative.
 */
const LOADERS: Record<string, () => Promise<Translation>> = {
  fr: () => import('../../i18n/fr.json').then((m) => m.default),
  en: () => import('../../i18n/en.json').then((m) => m.default),
};

@Injectable({ providedIn: 'root' })
export class TranslocoImportLoader implements TranslocoLoader {
  getTranslation(lang: string): Promise<Translation> {
    const load = LOADERS[lang];
    if (!load) {
      // Chemin inattendu (ex. scope non déclaré) : échouer bruyamment plutôt
      // que de servir fr silencieusement.
      return Promise.reject(new Error(`Aucune traduction déclarée pour « ${lang} »`));
    }
    return load();
  }
}
