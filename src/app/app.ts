import { afterNextRender, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Header } from './layout/header/header';
import { Footer } from './layout/footer/footer';
import { LanguageService } from './core/i18n/language.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslocoPipe, Header, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly #language = inject(LanguageService);

  constructor() {
    // Après l'hydratation seulement : le premier rendu client doit rester dans la
    // langue du HTML serveur (fr), sinon mismatch NG0500 pour un utilisateur en en.
    afterNextRender(() => this.#language.init());
  }

  /** Lien d'évitement : déplace le focus sur le contenu sans recharger la page. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }
}
