import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { APP_LANGS, LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Spinner } from '../../shared/spinner/spinner';
import { UserMenu } from './user-menu';

/** Compteur d'instances : id ARIA du panneau du burger. */
let headerUid = 0;

/**
 * Header global. Sur téléphone (≤ 640 px, bascule purement CSS), la nav et les
 * préférences (langue, thème) passent dans un panneau déroulant ouvert par le
 * burger (pattern disclosure) ; « Se connecter » / le menu utilisateur restent
 * visibles. Le panneau se ferme à la navigation, à Escape (focus rendu au
 * burger), à un focus sortant ou à un clic hors du header.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, UserMenu, Spinner],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    '(keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusOut($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Header {
  readonly #router = inject(Router);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly theme = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  protected readonly auth = inject(AuthService);
  protected readonly langs = APP_LANGS;

  protected readonly burgerButton = viewChild<ElementRef<HTMLButtonElement>>('burger');

  protected readonly menuOpen = signal(false);
  protected readonly menuId = `header-${headerUid++}-menu`;

  constructor() {
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected login(): void {
    void this.auth.login(this.#router.url);
  }

  protected onEscape(): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    this.burgerButton()?.nativeElement.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.#host.nativeElement.contains(next)) {
      this.menuOpen.set(false);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.#host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }
}
