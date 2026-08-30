import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AiCredentials, EMPTY_AI_CREDENTIALS } from './ai-credentials.model';
import { AiCredentialsService } from './ai-credentials.service';

const CREDENTIALS: AiCredentials = {
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  base_url: null,
  api_key_definie: true,
  ia_defaut_disponible: true,
  quota_quotidien: 30,
  appels_aujourdhui: 0,
};

describe('AiCredentialsService', () => {
  let service: AiCredentialsService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/users/me/ai-credentials`;

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        AiCredentialsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(AiCredentialsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('ne fait qu’un seul GET pour deux ensureLoaded() concurrents', async () => {
    const first = service.ensureLoaded();
    const second = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);

    expect(await first).toEqual(CREDENTIALS);
    expect(await second).toEqual(CREDENTIALS);
    expect(service.credentials()).toEqual(CREDENTIALS);
  });

  it('invalide la requête en vol sur erreur : le retry refait un GET', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    await expect(first).rejects.toBeTruthy();

    const retry = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    expect(await retry).toEqual(CREDENTIALS);
  });

  it('save fait un PUT (payload transmis tel quel) et remplace le signal', async () => {
    const payload = { provider: 'anthropic' as const, model: 'claude-sonnet-5', base_url: null };
    const submit = service.save(payload);

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    // Un payload sans clé n'invente pas de champ api_key.
    expect('api_key' in (req.request.body as object)).toBe(false);
    req.flush(CREDENTIALS);

    expect(await submit).toEqual(CREDENTIALS);
    expect(service.credentials()).toEqual(CREDENTIALS);
  });

  it('remove fait un DELETE puis RELIT le credential (quota de l’IA par défaut frais)', async () => {
    const removal = service.remove();
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));

    const fresh: AiCredentials = {
      ...EMPTY_AI_CREDENTIALS,
      ia_defaut_disponible: true,
      quota_quotidien: 30,
      appels_aujourdhui: 12,
    };
    const reread = httpMock.expectOne(url);
    expect(reread.request.method).toBe('GET');
    reread.flush(fresh);

    await removal;
    expect(service.credentials()).toEqual(fresh);
  });

  it('remove replie sur l’état vide si la relecture échoue (la suppression a réussi)', async () => {
    const removal = service.remove();
    httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));
    httpMock.expectOne(url).error(new ProgressEvent('network'));

    await removal;
    expect(service.credentials()).toEqual(EMPTY_AI_CREDENTIALS);
  });

  it('purge le credential quand la session tombe', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    await first;
    expect(service.credentials()).not.toBeNull();

    isAuthenticated.set(false);
    TestBed.tick();

    expect(service.credentials()).toBeNull();
  });
});
