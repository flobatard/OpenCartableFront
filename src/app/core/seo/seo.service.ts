import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { AppLang, APP_LANGS, DEFAULT_LANG, LanguageService } from '../i18n/language.service';
import { environment } from '../../../environments/environment';

const OG_LOCALE: Record<AppLang, string> = { fr: 'fr_FR', en: 'en_US' };

/**
 * Pose les metadata SEO au rendu (serveur/prerender comme navigateur). Title/Meta et les balises
 * <link> vivent hors de la frontière d'hydratation (racine = app-root) : les muter est sans risque.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  readonly #title = inject(Title);
  readonly #meta = inject(Meta);
  readonly #document = inject(DOCUMENT);
  readonly #transloco = inject(TranslocoService);
  readonly #language = inject(LanguageService);

  /** Metadata de la home dans la langue active : title, description, Open Graph, canonical, hreflang. */
  applyHome(): void {
    const lang = this.#language.lang();
    const title = this.#transloco.translate('home.metaTitle');
    const description = this.#transloco.translate('home.metaDescription');
    const url = this.#homeUrl(lang);

    this.#title.setTitle(title);
    this.#meta.updateTag({ name: 'description', content: description });
    this.#meta.updateTag({ property: 'og:type', content: 'website' });
    this.#meta.updateTag({ property: 'og:site_name', content: 'OpenCartable' });
    this.#meta.updateTag({ property: 'og:title', content: title });
    this.#meta.updateTag({ property: 'og:description', content: description });
    this.#meta.updateTag({ property: 'og:url', content: url });
    this.#meta.updateTag({ property: 'og:locale', content: OG_LOCALE[lang] });
    this.#meta.updateTag({
      property: 'og:image',
      content: `${environment.siteUrl}/opencartable-symbol.svg`,
    });

    this.#upsertLink('canonical', null, url);
    for (const alt of APP_LANGS) {
      this.#upsertLink('alternate', alt, this.#homeUrl(alt));
    }
    this.#upsertLink('alternate', 'x-default', this.#homeUrl(DEFAULT_LANG));
  }

  #homeUrl(lang: string): string {
    return `${environment.siteUrl}/${lang}/home`;
  }

  /** Crée ou met à jour une balise <link> (canonical / alternate hreflang), sans doublon. */
  #upsertLink(rel: string, hreflang: string | null, href: string): void {
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]`;
    let link = this.#document.head.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = this.#document.createElement('link');
      link.setAttribute('rel', rel);
      if (hreflang) {
        link.setAttribute('hreflang', hreflang);
      }
      this.#document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
