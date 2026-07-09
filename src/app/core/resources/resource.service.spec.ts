import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { COURSE_RESOURCES_FIXTURE } from '../../testing/resources.fixture';
import { AuthService } from '../auth/auth.service';
import { ResourcePresign } from './resource.model';
import { ResourceService } from './resource.service';

describe('ResourceService', () => {
  let service: ResourceService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/courses/course-1/resources`;

  const PRESIGN: ResourcePresign = {
    resource_id: 'resource-9',
    s3_key: 'resource-9/notes.pdf',
    upload_url: 'https://s3.test/put/resource-9/notes.pdf',
    statut: 'en_attente',
    expires_in: 900,
  };
  const CONFIRMED = {
    ...COURSE_RESOURCES_FIXTURE[0],
    id: 'resource-9',
    nom_original: 'notes.pdf',
  };

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        ResourceService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(ResourceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function loadList(): void {
    service.loadList('course-1');
    httpMock.expectOne(url).flush(COURSE_RESOURCES_FIXTURE);
  }

  it('loadList charge la bibliothèque dans les signaux', () => {
    loadList();
    expect(service.list()).toEqual(COURSE_RESOURCES_FIXTURE);
    expect(service.listLoading()).toBe(false);
    expect(service.listError()).toBe(false);
  });

  it('loadList signale l’erreur réseau et un nouvel appel refetch', () => {
    service.loadList('course-1');
    httpMock.expectOne(url).flush(null, { status: 500, statusText: 'Server Error' });
    expect(service.listError()).toBe(true);

    loadList();
    expect(service.listError()).toBe(false);
    expect(service.list()).toEqual(COURSE_RESOURCES_FIXTURE);
  });

  it('upload enchaîne presign → PUT S3 (sans Bearer) → confirm et insère en tête', async () => {
    loadList();
    const file = new File(['contenu'], 'notes.pdf', { type: 'application/pdf' });
    const upload = service.upload('course-1', file);

    // 1) Presign : le type est dérivé du MIME, la taille du fichier.
    const presignReq = httpMock.expectOne(url);
    expect(presignReq.request.method).toBe('POST');
    expect(presignReq.request.body).toEqual({
      nom_original: 'notes.pdf',
      mime: 'application/pdf',
      taille: file.size,
      type: 'document',
    });
    presignReq.flush(PRESIGN);
    await Promise.resolve(); // laisse la promesse enchaîner sur le PUT

    // 2) PUT direct navigateur→S3 : hors apiUrl → JAMAIS d'Authorization,
    //    et le Content-Type est STRICTEMENT le mime déclaré au presign.
    const putReq = httpMock.expectOne(PRESIGN.upload_url);
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.headers.has('Authorization')).toBe(false);
    expect(putReq.request.headers.get('Content-Type')).toBe('application/pdf');
    expect(putReq.request.body).toBe(file);
    putReq.flush('');
    await Promise.resolve();

    // 3) Confirm : sans body, la ressource confirmée arrive en tête de liste.
    const confirmReq = httpMock.expectOne(`${url}/${PRESIGN.resource_id}/confirm`);
    expect(confirmReq.request.method).toBe('POST');
    expect(confirmReq.request.body).toBeNull();
    confirmReq.flush(CONFIRMED);

    expect(await upload).toEqual(CONFIRMED);
    expect(service.list()[0]).toEqual(CONFIRMED);
    expect(service.uploadState()).toEqual({ phase: 'idle', progress: 0 });
  });

  it('upload en échec passe uploadState à error et rejette', async () => {
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    const upload = service.upload('course-1', file);
    httpMock.expectOne(url).flush(null, { status: 422, statusText: 'Unprocessable' });

    await expect(upload).rejects.toBeTruthy();
    expect(service.uploadState().phase).toBe('error');
  });

  it('un fichier sans MIME est déclaré application/octet-stream (type document)', async () => {
    const file = new File(['x'], 'mystere.bin', { type: '' });
    const upload = service.upload('course-1', file);

    const presignReq = httpMock.expectOne(url);
    expect(presignReq.request.body).toEqual({
      nom_original: 'mystere.bin',
      mime: 'application/octet-stream',
      taille: file.size,
      type: 'document',
    });
    presignReq.flush(null, { status: 422, statusText: 'Unprocessable' }); // court-circuit
    await expect(upload).rejects.toBeTruthy();
  });

  it('rename PATCH le nom et remplace l’entrée du signal', async () => {
    loadList();
    const renamed = { ...COURSE_RESOURCES_FIXTURE[0], nom_original: 'schema-final.pdf' };

    const rename = service.rename('course-1', 'resource-1', 'schema-final.pdf');
    const req = httpMock.expectOne(`${url}/resource-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nom_original: 'schema-final.pdf' });
    req.flush(renamed);

    expect(await rename).toEqual(renamed);
    expect(service.list()[0]).toEqual(renamed);
    expect(service.list()[1]).toEqual(COURSE_RESOURCES_FIXTURE[1]); // intact
  });

  it('deleteResource retire l’entrée du signal', async () => {
    loadList();
    const remove = service.deleteResource('course-1', 'resource-1');
    const req = httpMock.expectOne(`${url}/resource-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await remove;

    expect(service.list().map((r) => r.id)).toEqual(['resource-2', 'resource-3']);
  });

  it('getDownloadUrl retourne l’URL présignée (l’ouverture reste à l’appelant)', async () => {
    const download = service.getDownloadUrl('course-1', 'resource-1');
    const req = httpMock.expectOne(`${url}/resource-1/download`);
    expect(req.request.method).toBe('GET');
    req.flush({ download_url: 'https://s3.test/get/uuid/schema.pdf', expires_in: 300 });

    expect(await download).toBe('https://s3.test/get/uuid/schema.pdf');
  });

  it('une mutation d’un autre cours ne touche pas la liste chargée', async () => {
    loadList();
    const remove = service.deleteResource('course-2', 'resource-x');
    httpMock
      .expectOne(`${environment.apiUrl}/v1/courses/course-2/resources/resource-x`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await remove;

    expect(service.list()).toEqual(COURSE_RESOURCES_FIXTURE);
  });

  it('purge la liste et l’état d’upload quand la session tombe', () => {
    loadList();
    isAuthenticated.set(false);
    TestBed.tick(); // flush de l'effect de purge

    expect(service.list()).toEqual([]);
    expect(service.uploadState()).toEqual({ phase: 'idle', progress: 0 });
  });
});
