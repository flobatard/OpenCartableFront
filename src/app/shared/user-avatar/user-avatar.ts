import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, input, signal } from '@angular/core';

/** Taille de l'avatar ; mappée sur une variable CSS de diamètre. */
export type UserAvatarSize = 'sm' | 'md' | 'lg';

/**
 * Photo de profil ronde avec repli icône utilisateur générique (SVG inline,
 * patron des icônes du header). Purement DÉCORATIF : le nom de la personne
 * est toujours affiché à côté par l'hôte — d'où `alt=""`/`aria-hidden` et
 * l'absence de clés i18n propres.
 *
 * Le repli s'affiche quand `url` est nulle OU quand l'image échoue à charger
 * (URL présignée S3 expirée au re-rendu — TTL court) : le handler `(error)`
 * bascule proprement, et un nouvel `url` réarme l'image.
 */
@Component({
  selector: 'app-user-avatar',
  imports: [NgTemplateOutlet],
  templateUrl: './user-avatar.html',
  styleUrl: './user-avatar.scss',
  host: {
    '[class]': '"user-avatar user-avatar--" + size()',
    'aria-hidden': 'true',
  },
})
export class UserAvatar {
  /** URL (présignée) de la photo ; `null` = repli icône générique. */
  readonly url = input<string | null>(null);
  readonly size = input<UserAvatarSize>('md');

  protected readonly errored = signal(false);

  constructor() {
    // Un changement d'URL réarme l'image (l'erreur appartenait à l'ancienne).
    effect(() => {
      this.url();
      this.errored.set(false);
    });
  }

  protected onError(): void {
    this.errored.set(true);
  }
}
