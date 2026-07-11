import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';

@Component({
  selector: 'app-footer',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  /* Obligation AGPL « réseau » : le lien vers les sources reste visible sur chaque page. */
  protected readonly sourceUrl = 'https://github.com/flobatard/OpenCartableFront';
  protected readonly language = inject(LanguageService);
}
