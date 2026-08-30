import { TestBed } from '@angular/core/testing';
import { OAuthService } from 'angular-oauth2-oidc';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';
import { AuthService } from './auth.service';

interface OAuthServiceMock {
  configure: ReturnType<typeof vi.fn>;
  events: Subject<unknown>;
  hasValidAccessToken: ReturnType<typeof vi.fn>;
  getIdentityClaims: ReturnType<typeof vi.fn>;
  getAccessToken: ReturnType<typeof vi.fn>;
  loadDiscoveryDocument: ReturnType<typeof vi.fn>;
  initCodeFlow: ReturnType<typeof vi.fn>;
  tryLoginCodeFlow: ReturnType<typeof vi.fn>;
  setupAutomaticSilentRefresh: ReturnType<typeof vi.fn>;
  logOut: ReturnType<typeof vi.fn>;
  state?: string;
}

describe('AuthService', () => {
  let oauth: OAuthServiceMock;
  let notifications: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    notifications = { error: vi.fn() };
    oauth = {
      configure: vi.fn(),
      events: new Subject<unknown>(),
      hasValidAccessToken: vi.fn().mockReturnValue(false),
      getIdentityClaims: vi.fn().mockReturnValue(null),
      getAccessToken: vi.fn().mockReturnValue(null),
      loadDiscoveryDocument: vi.fn().mockResolvedValue(undefined),
      initCodeFlow: vi.fn(),
      tryLoginCodeFlow: vi.fn().mockResolvedValue(undefined),
      setupAutomaticSilentRefresh: vi.fn(),
      logOut: vi.fn(),
      state: '',
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: OAuthService, useValue: oauth },
        { provide: NotificationService, useValue: notifications },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });
  });

  it('configures the PKCE code flow at browser startup', () => {
    TestBed.inject(AuthService);
    expect(oauth.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        responseType: 'code',
        redirectUri: expect.stringContaining('/auth/callback'),
      }),
    );
  });

  it('starts unauthenticated without any network call when no token is stored', () => {
    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(false);
    expect(oauth.loadDiscoveryDocument).not.toHaveBeenCalled();
  });

  it('login loads the discovery then starts the code flow with the target URL', async () => {
    const service = TestBed.inject(AuthService);
    await service.login('/cours/42');
    expect(oauth.loadDiscoveryDocument).toHaveBeenCalledTimes(1);
    expect(oauth.initCodeFlow).toHaveBeenCalledWith('/cours/42');
  });

  it('login exposes loggingIn during the discovery and keeps it active until the redirect', async () => {
    const service = TestBed.inject(AuthService);
    let resolveDiscovery!: () => void;
    oauth.loadDiscoveryDocument.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDiscovery = resolve;
      }),
    );

    const pending = service.login('/cours/42');
    expect(service.loggingIn()).toBe(true);

    resolveDiscovery();
    await pending;

    // Pas de reset à `false` : `initCodeFlow` recharge la page.
    expect(service.loggingIn()).toBe(true);
  });

  it('login notifies an error when the discovery fails and resets loggingIn', async () => {
    const service = TestBed.inject(AuthService);
    oauth.loadDiscoveryDocument.mockRejectedValue(new Error('IdP injoignable'));

    await expect(service.login('/cours/42')).rejects.toThrow();

    expect(oauth.initCodeFlow).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('notifications.loginError');
    expect(service.loggingIn()).toBe(false);
  });

  it('completeLogin exchanges the code and restores the internal URL', async () => {
    const service = TestBed.inject(AuthService);
    oauth.state = encodeURIComponent('/cours/42');
    oauth.hasValidAccessToken.mockReturnValue(true);
    oauth.getIdentityClaims.mockReturnValue({ name: 'Prof' });

    const target = await service.completeLogin();

    expect(oauth.tryLoginCodeFlow).toHaveBeenCalled();
    expect(target).toBe('/cours/42');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.displayName()).toBe('Prof');
  });

  it('completeLogin refuses a state that does not point to an internal path', async () => {
    const service = TestBed.inject(AuthService);
    oauth.state = encodeURIComponent('https://evil.example/phishing');
    expect(await service.completeLogin()).toBe('/');

    oauth.state = encodeURIComponent('//evil.example');
    expect(await service.completeLogin()).toBe('/');
  });

  it('resyncs the signals on OAuth events', () => {
    const service = TestBed.inject(AuthService);
    oauth.hasValidAccessToken.mockReturnValue(true);
    oauth.getIdentityClaims.mockReturnValue({ email: 'prof@example.org' });

    oauth.events.next({ type: 'token_received' });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.displayName()).toBe('prof@example.org');
  });

  it('logout clears the session even when the discovery fails', async () => {
    const service = TestBed.inject(AuthService);
    oauth.loadDiscoveryDocument.mockRejectedValue(new Error('IdP injoignable'));
    await service.logout();
    expect(oauth.logOut).toHaveBeenCalled();
  });
});
