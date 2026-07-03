import { TestBed } from '@angular/core/testing';
import { OAuthService } from 'angular-oauth2-oidc';
import { Subject } from 'rxjs';
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

  beforeEach(() => {
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
      providers: [{ provide: OAuthService, useValue: oauth }],
    });
  });

  it('configure le code flow PKCE au démarrage navigateur', () => {
    TestBed.inject(AuthService);
    expect(oauth.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        responseType: 'code',
        redirectUri: expect.stringContaining('/auth/callback'),
      }),
    );
  });

  it('démarre non authentifié sans appel réseau quand aucun token n’est stocké', () => {
    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(false);
    expect(oauth.loadDiscoveryDocument).not.toHaveBeenCalled();
  });

  it('login charge la discovery puis démarre le code flow avec l’URL cible', async () => {
    const service = TestBed.inject(AuthService);
    await service.login('/cours/42');
    expect(oauth.loadDiscoveryDocument).toHaveBeenCalledTimes(1);
    expect(oauth.initCodeFlow).toHaveBeenCalledWith('/cours/42');
  });

  it('completeLogin échange le code et restaure l’URL interne', async () => {
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

  it('completeLogin refuse un state qui ne pointe pas vers un chemin interne', async () => {
    const service = TestBed.inject(AuthService);
    oauth.state = encodeURIComponent('https://evil.example/phishing');
    expect(await service.completeLogin()).toBe('/');

    oauth.state = encodeURIComponent('//evil.example');
    expect(await service.completeLogin()).toBe('/');
  });

  it('resynchronise les signaux sur les événements OAuth', () => {
    const service = TestBed.inject(AuthService);
    oauth.hasValidAccessToken.mockReturnValue(true);
    oauth.getIdentityClaims.mockReturnValue({ email: 'prof@example.org' });

    oauth.events.next({ type: 'token_received' });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.displayName()).toBe('prof@example.org');
  });

  it('logout purge la session même si la discovery échoue', async () => {
    const service = TestBed.inject(AuthService);
    oauth.loadDiscoveryDocument.mockRejectedValue(new Error('IdP injoignable'));
    await service.logout();
    expect(oauth.logOut).toHaveBeenCalled();
  });
});
