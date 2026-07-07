import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { APP_LANGS, LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { UserMenu } from './user-menu';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, UserMenu],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  readonly #router = inject(Router);

  protected readonly theme = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  protected readonly auth = inject(AuthService);
  protected readonly langs = APP_LANGS;

  protected login(): void {
    void this.auth.login(this.#router.url);
  }
}
