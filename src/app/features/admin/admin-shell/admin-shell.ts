import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Coquille du backoffice (`/:lang/admin`, rôle de plateforme `super_admin`) :
 * menu latéral gauche (liens router relatifs, une entrée par domaine
 * d'administration — « Jobs » pour l'instant) + `router-outlet`. Motif de
 * `SettingsShell`, sans logique : les guards vivent sur la route parente, les
 * sous-pages portent leur propre chargement et leur `h1`.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell {}
