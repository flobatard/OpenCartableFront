import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { COURSES_FIXTURE } from '../../testing/courses.fixture';
import { AuthService } from '../auth/auth.service';
import { CourseService } from './course.service';
import { CourseTransferService } from './course-transfer.service';

describe('CourseTransferService', () => {
  let service: CourseTransferService;
  let courses: CourseService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/courses`;

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(CourseTransferService);
    courses = TestBed.inject(CourseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('exportCourse fetches the archive as a blob (Bearer via interceptor, no window.open)', async () => {
    const promise = service.exportCourse('course-1');
    const req = httpMock.expectOne(`${url}/course-1/export`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');

    const archive = new Blob(['zip'], { type: 'application/zip' });
    req.flush(archive);

    expect(await promise).toBe(archive);
  });

  it('importCourse POSTs a FormData, tracks progress and inserts the course first', async () => {
    courses.loadList();
    httpMock.expectOne(url).flush(COURSES_FIXTURE);
    const imported = { ...COURSES_FIXTURE[0], id: 'course-importe' };

    const promise = service.importCourse(
      new File(['zip'], 'cours.zip', { type: 'application/zip' }),
    );
    const req = httpMock.expectOne(`${url}/import`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    // Jamais de Content-Type manuel : le navigateur pose lui-même le boundary.
    expect(req.request.headers.has('Content-Type')).toBe(false);
    expect(service.importState()).toEqual({ phase: 'uploading', progress: 0 });

    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    expect(service.importState()).toEqual({ phase: 'uploading', progress: 50 });

    // Corps entièrement envoyé : le back parse l'archive et pousse vers S3.
    req.event({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
    expect(service.importState()).toEqual({ phase: 'processing', progress: 100 });

    req.flush(imported);
    expect(await promise).toEqual(imported);
    expect(courses.list()[0]).toEqual(imported);
    expect(service.importState()).toEqual({ phase: 'idle', progress: 0 });
  });

  it('importCourse switches to error and rejects when the backend refuses', async () => {
    const promise = service.importCourse(new File(['x'], 'c.zip', { type: 'application/zip' }));
    httpMock
      .expectOne(`${url}/import`)
      .flush({ detail: 'invalide' }, { status: 422, statusText: 'Unprocessable Content' });

    await expect(promise).rejects.toMatchObject({ status: 422 });
    expect(service.importState()).toEqual({ phase: 'error', progress: 0 });
    expect(courses.list()).toEqual([]);
  });

  it('purges the import state when the session ends', async () => {
    const promise = service.importCourse(new File(['x'], 'c.zip', { type: 'application/zip' }));
    httpMock
      .expectOne(`${url}/import`)
      .flush({ detail: 'invalide' }, { status: 503, statusText: 'Unavailable' });
    await expect(promise).rejects.toMatchObject({ status: 503 });
    expect(service.importState().phase).toBe('error');

    isAuthenticated.set(false);
    TestBed.tick(); // flush de l'effect de purge

    expect(service.importState()).toEqual({ phase: 'idle', progress: 0 });
  });
});
