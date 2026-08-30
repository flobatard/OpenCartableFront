import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Coquille du hub « Paramètres » (`/:lang/settings`) : menu latéral gauche
 * (liens router relatifs vers les sous-pages) + `router-outlet`. Aucune
 * logique — les guards vivent sur la route parente, les sous-pages portent
 * leur propre chargement.
 */
@Component({
  selector: 'app-settings-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './settings-shell.html',
  styleUrl: './settings-shell.scss',
})
export class SettingsShell {}
