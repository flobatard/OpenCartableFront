import { Component, effect, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { SeoService } from '../../core/seo/seo.service';

@Component({
  selector: 'app-home',
  imports: [TranslocoPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly projectUrl = 'https://github.com/flobatard/OpenCartableFront';

  readonly #language = inject(LanguageService);
  readonly #seo = inject(SeoService);

  constructor() {
    // Applique les metadata SEO au rendu (serveur/prerender) et les réapplique au switch de langue.
    effect(() => {
      this.#language.lang();
      this.#seo.applyHome();
    });
  }
}
