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
    { id: 'module-1', titre: 'Quiz interactif', created_at: '2026-07-01', updated_at: '2026-07-01' },
    { id: 'module-2', titre: 'Simulation', created_at: '2026-06-01', updated_at: '2026-06-01' },
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

  it('loadList charge la bibliothèque dans les signaux', () => {
    loadList();
    expect(service.list()).toEqual(SUMMARIES);
    expect(service.listLoading()).toBe(false);
    expect(service.listError()).toBe(false);
  });

  it('loadList signale l’erreur réseau et un nouvel appel refetch', () => {
    service.loadList('course-1');
    httpMock.expectOne(url).flush(null, { status: 500, statusText: 'Server Error' });
    expect(service.listError()).toBe(true);

    loadList();
    expect(service.listError()).toBe(false);
    expect(service.list()).toEqual(SUMMARIES);
  });

  it('createModule POST le titre et insère le résumé en tête de liste', async () => {
    loadList();
    const create = service.createModule('course-1', { titre: 'Nouveau module' });
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ titre: 'Nouveau module' });
    req.flush({ ...DETAIL, id: 'module-9', titre: 'Nouveau module' });

    const created = await create;
    expect(created.id).toBe('module-9');
    expect(service.list()[0]).toEqual({
      id: 'module-9',
      titre: 'Nouveau module',
      created_at: DETAIL.created_at,
      updated_at: DETAIL.updated_at,
    });
    // La liste reste des résumés : jamais de code dedans.
    expect('html' in service.list()[0]).toBe(false);
  });

  it('getModule GET le détail une seule fois (promesse partagée en cache)', async () => {
    const first = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    expect(await first).toEqual(DETAIL);

    // Deuxième appel : servi par le cache, AUCUNE requête (verify le garantit).
    expect(await service.getModule('course-1', 'module-1')).toEqual(DETAIL);
  });

  it('getModule en échec est retiré du cache (retry possible)', async () => {
    const first = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(null, { status: 404, statusText: 'Not Found' });
    await expect(first).rejects.toBeTruthy();

    const retry = service.getModule('course-1', 'module-1');
    httpMock.expectOne(`${url}/module-1`).flush(DETAIL);
    expect(await retry).toEqual(DETAIL);
  });

  it('updateModule PATCH partiel, rafraîchit le cache et l’entrée de liste', async () => {
    loadList();
    const update = service.updateModule('course-1', 'module-1', { titre: 'Quiz v2' });
    const req = httpMock.expectOne(`${url}/module-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ titre: 'Quiz v2' });
    req.flush({ ...DETAIL, titre: 'Quiz v2' });
    await update;

    expect(service.list()[0].titre).toBe('Quiz v2');
    // Le cache de détail est rafraîchi : pas de nouvelle requête.
    expect((await service.getModule('course-1', 'module-1')).titre).toBe('Quiz v2');
  });

  it('renameModule délègue à updateModule (PATCH {titre})', async () => {
    const rename = service.renameModule('course-1', 'module-1', 'Renommé');
    const req = httpMock.expectOne(`${url}/module-1`);
    expect(req.request.body).toEqual({ titre: 'Renommé' });
    req.flush({ ...DETAIL, titre: 'Renommé' });
    expect((await rename).titre).toBe('Renommé');
  });

  it('deleteModule DELETE, retire de la liste et invalide le cache', async () => {
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

  it('purge liste et cache à la déconnexion', async () => {
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
