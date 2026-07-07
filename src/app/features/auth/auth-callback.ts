import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import {
  LanguageService,
  langFromPath,
  resolveStoredOrBrowserLang,
} from '../../core/i18n/language.service';
import { UserProfileService } from '../../core/users/user-profile.service';

/** Retour du code flow OIDC — route rendue uniquement côté navigateur (RenderMode.Client). */
@Component({
  selector: 'app-auth-callback',
  imports: [TranslocoPipe, RouterLink],
  template: `
    @if (error()) {
      <p class="callback-message">{{ 'auth.error' | transloco }}</p>
      <a [routerLink]="['/', language.lang(), 'home']">{{ 'header.home' | transloco }}</a>
    } @else {
      <p class="callback-message" aria-live="polite">{{ 'auth.signingIn' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 48px 24px;
      text-align: center;
    }

    .callback-message {
      color: var(--text-secondary);
    }
  `,
})
export class AuthCallback implements OnInit {
  readonly #auth = inject(AuthService);
  readonly #profiles = inject(UserProfileService);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly language = inject(LanguageService);

  readonly error = signal(false);

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    try {
      const target = await this.#auth.completeLogin();
      await this.#router.navigateByUrl(await this.#postLoginUrl(target), { replaceUrl: true });
    } catch {
      this.error.set(true);
    }
  }

  /** Détourne vers l'onboarding (en préservant la cible) si le profil est incomplet. */
  async #postLoginUrl(target: string): Promise<string | UrlTree> {
    try {
      const profile = await this.#profiles.ensureLoaded();
      if (!profile.onboarding_complete) {
        const lang = target !== '/' ? langFromPath(target) : resolveStoredOrBrowserLang();
        return this.#router.createUrlTree(['/', lang, 'onboarding'], {
          queryParams: { next: target },
        });
      }
    } catch {
      // Profil injoignable : fail-open, on garde la cible d'origine.
    }
    return target;
  }
}
