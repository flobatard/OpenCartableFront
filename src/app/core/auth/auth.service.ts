import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthConfig, OAuthService } from 'angular-oauth2-oidc';
import { TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { NotificationService } from '../notifications/notification.service';

/**
 * Abstraction du flow OIDC (Authorization Code + PKCE) : le reste de l'app ne
 * dépend jamais d'angular-oauth2-oidc, seulement de ce service — l'IdP
 * (Zitadel aujourd'hui) reste remplaçable.
 *
 * Côté serveur (SSR/prerender), le service est inerte : aucune configuration,
 * aucun appel réseau. L'état d'authentification se resynchronise au bootstrap
 * navigateur depuis le storage, sans dépendre de la disponibilité de l'IdP —
 * les pages publiques (élèves) ne parlent jamais à Zitadel.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly #oauth = inject(OAuthService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #isAuthenticated = signal(false);
  readonly isAuthenticated = this.#isAuthenticated.asReadonly();

  readonly #loggingIn = signal(false);
  /** Vrai entre le clic sur « Se connecter » et la redirection effective vers l'IdP. */
  readonly loggingIn = this.#loggingIn.asReadonly();

  readonly #identityClaims = signal<Record<string, unknown> | null>(null);
  readonly identityClaims = this.#identityClaims.asReadonly();

  readonly displayName = computed(() => {
    const claims = this.#identityClaims();
    return (claims?.['name'] ?? claims?.['preferred_username'] ?? claims?.['email'] ?? null) as
      | string
      | null;
  });

  #discovery: Promise<void> | null = null;

  constructor() {
    if (!this.#isBrowser) {
      return;
    }
    this.#configure();
    this.#oauth.events.subscribe(() => this.#syncFromStorage());
    this.#syncFromStorage();
    if (this.#isAuthenticated()) {
      // Session existante : préparer le rafraîchissement silencieux en tâche de fond.
      this.#ensureDiscovery()
        .then(() => this.#oauth.setupAutomaticSilentRefresh())
        .catch(() => {
          // IdP injoignable : la session vivra jusqu'à expiration du token, mais
          // on prévient l'utilisateur que le service d'auth est inaccessible.
          this.#notifications.error(this.#transloco.translate('notifications.connectionError'));
        });
    }
  }

  get accessToken(): string | null {
    return this.#isBrowser ? this.#oauth.getAccessToken() : null;
  }

  /** Démarre le code flow ; `targetUrl` est restauré au retour du callback. */
  async login(targetUrl?: string): Promise<void> {
    this.#loggingIn.set(true);
    try {
      await this.#ensureDiscovery();
    } catch (error) {
      // Discovery injoignable : pas de redirection possible, on le signale.
      this.#loggingIn.set(false);
      this.#notifications.error(this.#transloco.translate('notifications.loginError'));
      throw error;
    }
    // Pas de reset à `false` ici : `initCodeFlow` recharge la page, le spinner
    // doit rester visible jusqu'à la redirection effective.
    this.#oauth.initCodeFlow(targetUrl ?? '/');
  }

  /**
   * Traite le retour de l'IdP (route auth/callback) : échange le code contre
   * les tokens et retourne l'URL interne à restaurer.
   */
  async completeLogin(): Promise<string> {
    await this.#ensureDiscovery();
    await this.#oauth.tryLoginCodeFlow();
    this.#syncFromStorage();
    this.#oauth.setupAutomaticSilentRefresh();
    const target = this.#oauth.state ? decodeURIComponent(this.#oauth.state) : '/';
    // L'état vient de l'URL de callback : ne restaurer que des chemins internes.
    return target.startsWith('/') && !target.startsWith('//') ? target : '/';
  }

  async logout(): Promise<void> {
    try {
      await this.#ensureDiscovery();
    } catch {
      // pas de redirection IdP possible : logOut() se contentera de purger le storage
    }
    this.#oauth.logOut();
    this.#syncFromStorage();
  }

  #configure(): void {
    const { oidc } = environment;
    const config: AuthConfig = {
      issuer: oidc.issuer,
      clientId: oidc.clientId,
      redirectUri: location.origin + oidc.redirectPath,
      postLogoutRedirectUri: location.origin + oidc.postLogoutRedirectPath,
      responseType: 'code', // PKCE actif par défaut, client public sans secret
      scope: oidc.scope,
      requireHttps: oidc.requireHttps,
      showDebugInformation: oidc.showDebugInformation,
    };
    this.#oauth.configure(config);
  }

  #ensureDiscovery(): Promise<void> {
    this.#discovery ??= this.#oauth
      .loadDiscoveryDocument()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.#discovery = null; // permet de retenter au prochain appel
        throw error;
      });
    return this.#discovery;
  }

  #syncFromStorage(): void {
    const authenticated = this.#oauth.hasValidAccessToken();
    this.#isAuthenticated.set(authenticated);
    this.#identityClaims.set(
      authenticated ? ((this.#oauth.getIdentityClaims() as Record<string, unknown>) ?? null) : null,
    );
  }
}
