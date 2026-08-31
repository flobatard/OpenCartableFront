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
  api_key_set: true,
  default_ai_available: true,
  daily_quota: 30,
  calls_today: 0,
  default_provider: 'mistral',
  default_model: 'ministral-14b-latest',
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

  it('issues a single GET for two concurrent ensureLoaded() calls', async () => {
    const first = service.ensureLoaded();
    const second = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);

    expect(await first).toEqual(CREDENTIALS);
    expect(await second).toEqual(CREDENTIALS);
    expect(service.credentials()).toEqual(CREDENTIALS);
  });

  it('invalidates the in-flight request on error: the retry issues a new GET', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    await expect(first).rejects.toBeTruthy();

    const retry = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    expect(await retry).toEqual(CREDENTIALS);
  });

  it('refresh always re-issues a GET and replaces the signal (fresh quota counter)', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    await first;

    const refreshed = service.refresh();
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('GET');
    req.flush({ ...CREDENTIALS, calls_today: 7 });

    expect(await refreshed).toEqual({ ...CREDENTIALS, calls_today: 7 });
    expect(service.credentials()?.calls_today).toBe(7);
  });

  it('save PUTs (payload passed through as-is) and replaces the signal', async () => {
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

  it('remove DELETEs then RE-READS the credential (fresh default-AI quota)', async () => {
    const removal = service.remove();
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));

    const fresh: AiCredentials = {
      ...EMPTY_AI_CREDENTIALS,
      default_ai_available: true,
      daily_quota: 30,
      calls_today: 12,
    };
    const reread = httpMock.expectOne(url);
    expect(reread.request.method).toBe('GET');
    reread.flush(fresh);

    await removal;
    expect(service.credentials()).toEqual(fresh);
  });

  it('remove falls back to the empty state when the re-read fails (the deletion succeeded)', async () => {
    const removal = service.remove();
    httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));
    httpMock.expectOne(url).error(new ProgressEvent('network'));

    await removal;
    expect(service.credentials()).toEqual(EMPTY_AI_CREDENTIALS);
  });

  it('testConnection POSTs the PUT-shaped payload to /test, without touching the signal', async () => {
    const payload = { provider: 'anthropic' as const, model: 'claude-sonnet-5', base_url: null };
    const test = service.testConnection(payload);

    const req = httpMock.expectOne(`${url}/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ ok: true });

    await test;
    expect(service.credentials()).toBeNull(); // rien persisté, rien chargé
  });

  it('testConnection relays the provider failure to the caller', async () => {
    const test = service.testConnection({
      provider: 'openai',
      model: 'gpt-4o',
      api_key: 'sk-mauvaise',
      base_url: null,
    });
    httpMock
      .expectOne(`${url}/test`)
      .flush({ detail: 'refusée' }, { status: 400, statusText: 'Bad Request' });
    await expect(test).rejects.toMatchObject({ status: 400 });
  });

  it('listModels POSTs to /models (key in the body, never in the URL) and unwraps the list', async () => {
    const models = service.listModels({ provider: 'ollama', base_url: 'http://pi:11434' });

    const req = httpMock.expectOne(`${url}/models`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ provider: 'ollama', base_url: 'http://pi:11434' });
    req.flush({ models: ['llama3.2:latest', 'qwen3:8b'] });

    expect(await models).toEqual(['llama3.2:latest', 'qwen3:8b']);
  });

  it('clears the credential when the session drops', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    await first;
    expect(service.credentials()).not.toBeNull();

    isAuthenticated.set(false);
    TestBed.tick();

    expect(service.credentials()).toBeNull();
  });
});
