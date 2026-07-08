import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Header } from './layout/header/header';
import { Footer } from './layout/footer/footer';
import { Snackbar } from './shared/snackbar/snackbar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslocoPipe, Header, Footer, Snackbar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // La langue est posée depuis l'URL par l'app initializer (avant le premier rendu, serveur
  // et client) : plus de restauration depuis le storage ici, qui entrerait en conflit avec l'URL.

  /** Lien d'évitement : déplace le focus sur le contenu sans recharger la page. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }
}
