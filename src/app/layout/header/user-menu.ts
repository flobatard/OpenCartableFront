import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';

/** Compteur d'instances : id ARIA unique si plusieurs menus coexistaient. */
let menuUid = 0;

/**
 * Menu utilisateur du header (pattern APG « menu button ») : le nom de
 * l'utilisateur connecté déclenche un menu « Mon profil » / « Se déconnecter ».
 * Mécanique d'ouverture reprise du disclosure d'`EducationLevelPicker` :
 * Escape ferme et rend le focus au déclencheur, un focus sortant du composant
 * ferme, les flèches ouvrent puis cyclent entre les items.
 */
@Component({
  selector: 'app-user-menu',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './user-menu.html',
  styleUrl: './user-menu.scss',
})
export class UserMenu {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);

  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);

  protected readonly triggerButton = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');

  protected readonly open = signal(false);
  protected readonly menuId = `user-menu-${menuUid++}-panel`;

  protected toggle(): void {
    this.open() ? this.closeMenu() : this.open.set(true);
  }

  protected closeMenu(): void {
    this.open.set(false);
  }

  /** Flèche bas/haut sur le déclencheur : ouvre et focalise le 1er/dernier item. */
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    this.open.set(true);
    // Zoneless : le panneau n'est pas encore rendu — focus après le prochain rendu.
    afterNextRender(
      () => {
        const items = this.#items();
        items[event.key === 'ArrowDown' ? 0 : items.length - 1]?.focus();
      },
      { injector: this.#injector },
    );
  }

  /** Flèches dans le menu : cycle entre les items. */
  protected onMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const items = this.#items();
    if (!items.length) {
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    items[(current + delta + items.length) % items.length].focus();
  }

  protected onEscape(): void {
    if (!this.open()) {
      return;
    }
    this.closeMenu();
    this.triggerButton()?.nativeElement.focus();
  }

  /** Ferme si le focus quitte le composant (clic/tab en dehors). */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.#host.nativeElement.contains(next)) {
      this.closeMenu();
    }
  }

  protected logout(): void {
    this.closeMenu();
    void this.auth.logout();
  }

  #items(): HTMLElement[] {
    return [...this.#host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }
}
