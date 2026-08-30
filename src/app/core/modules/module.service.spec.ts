import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ModuleDetail, ModuleSummary } from './module.model';
import { ModuleService } from './module.service';

describe('ModuleService', () => {
  let service: ModuleService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/courses/course-1/modules`;

  const SUMMARIES: ModuleSummary[] = [
    { id: 'module-1', title: 'Quiz interactif', created_at: '2026-07-01', updated_at: '2026-07-01' },
    { id: 'module-2', title: 'Simulation', created_at: '2026-06-01', updated_at: '2026-06-01' },
  ];

  const DETAIL: ModuleDetail = {
    ...SUMMARIES[0],
    html: '<p>Salut</p>',
    css: 'p { color: red; }',
    js: "console.log('ok')",
  };

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        ModuleService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(ModuleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function loadList(): void {
    service.loadList('course-1');
    httpMock.expectOne(url).flush(SUMMARIES);
  }

  it('loadList loads the library into the signals', () => {
    loadList();
    expect(service.list()).toEqual(SUMMARIES);
    expect(service.listLoading()).toBe(false);
    expect(service.listError()).toBe(false);
  });

  it('loadList reports the network error and a new call refetches', () => {
    service.loadList('course-1');
    httpMock.expectOne(url).flush(null, { status: 500, statusText: 'Server Error' });
    expect(service.listError()).toBe(true);

    loadList();
    expect(service.listError()).toBe(false);
    expect(service.list()).toEqual(SUMMARIES);
  });

  it('a stale response (previous course) touches neither error nor loading of the current course', () => {
    const urlB = `${environment.apiUrl}/v1/courses/course-2/modules`;
    service.loadList('course-1');
    const staleReq = httpMock.expectOne(url);
    service.loadList('course-2'); // navigation vers un autre cours

    // L'échec tardif du cours 1 n'affiche pas d'erreur sur le cours 2, et ne
    // coupe pas son état de chargement.
    staleReq.flush(null, { status: 500, statusText: 'Server Error' });
    expect(service.listError()).toBe(false);
    expect(service.listLoading()).toBe(true);

    httpMock.expectOne(urlB).flush(SUMMARIES);
    expect(service.list()).toEqual(SUMMARIES);
    expect(service.listLoading()).toBe(false);
  });

  it('createModule POSTs the title and inserts the summary at the head of the list', async () => {
    loadList();
    const create = service.createModule('course-1', { title: 'Nouveau module' });
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Nouveau module' });
    req.flush({ ...DETAIL, id: 'module-9', title: 'Nouveau module' });

    const created = await create;
    expect(created.id).toBe('module-9');
    expect(service.list()[0]).toEqual({
      id: 'module-9',
      title: 'Nouveau module',
      created_at: DETAIL.created_at,
      updated_at: DETAIL.updated_at,
    });
    // La liste reste des résumés : jamais de code dedans.
    expect('html' in service.list()[0]).toBe(false);
  });

  it('getModule GETs the detail only once (shared cached promise)', async () => {
    const first = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    expect(await first).toEqual(DETAIL);

    // Deuxième appel : servi par le cache, AUCUNE requête (verify le garantit).
    expect(await service.getModule('course-1', 'module-1')).toEqual(DETAIL);
  });

  it('a failed getModule is removed from the cache (retry possible)', async () => {
    const first = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(null, { status: 404, statusText: 'Not Found' });
    await expect(first).rejects.toBeTruthy();

    const retry = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    expect(await retry).toEqual(DETAIL);
  });

  it('updateModule partial PATCH refreshes the cache and the list entry', async () => {
    loadList();
    const update = service.updateModule('course-1', 'module-1', { title: 'Quiz v2' });
    const req = httpMock.expectOne(`${url}/module-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'Quiz v2' });
    req.flush({ ...DETAIL, title: 'Quiz v2' });
    await update;

    expect(service.list()[0].title).toBe('Quiz v2');
    // Le cache de détail est rafraîchi : pas de nouvelle requête.
    expect((await service.getModule('course-1', 'module-1')).title).toBe('Quiz v2');
  });

  it('renameModule delegates to updateModule (PATCH {title})', async () => {
    const rename = service.renameModule('course-1', 'module-1', 'Renommé');
    const req = httpMock.expectOne(`${url}/module-1`);
    expect(req.request.body).toEqual({ title: 'Renommé' });
    req.flush({ ...DETAIL, title: 'Renommé' });
    expect((await rename).title).toBe('Renommé');
  });

  it('deleteModule DELETEs, removes from the list and invalidates the cache', async () => {
    loadList();
    // Peuple le cache de détail.
    const get = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    await get;

    const del = service.deleteModule('course-1', 'module-1');
    const req = httpMock.expectOne(`${url}/module-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await del;

    expect(service.list().map((m) => m.id)).toEqual(['module-2']);
    // Cache invalidé : une nouvelle requête part.
    const refetch = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    await refetch;
  });

  it('clears list and cache on logout', async () => {
    loadList();
    const get = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    await get;

    isAuthenticated.set(false);
    TestBed.tick();

    expect(service.list()).toEqual([]);
    // Cache purgé : le prochain getModule refait une requête.
    const refetch = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    await refetch;
  });
});
