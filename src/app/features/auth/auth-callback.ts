import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';

/** Retour du code flow OIDC — route rendue uniquement côté navigateur (RenderMode.Client). */
@Component({
  selector: 'app-auth-callback',
  imports: [TranslocoPipe, RouterLink],
  template: `
    @if (error()) {
      <p class="callback-message">{{ 'auth.error' | transloco }}</p>
      <a routerLink="/">{{ 'header.home' | transloco }}</a>
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
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly error = signal(false);

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    try {
      const target = await this.#auth.completeLogin();
      await this.#router.navigateByUrl(target, { replaceUrl: true });
    } catch {
      this.error.set(true);
    }
  }
}
