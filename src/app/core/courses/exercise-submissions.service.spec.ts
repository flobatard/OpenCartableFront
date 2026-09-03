import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { ExerciseSubmissionsService } from './exercise-submissions.service';

const BASE = 'http://localhost:8000/api/v1/courses/course-1/blocks/block-3/submissions';

describe('ExerciseSubmissionsService', () => {
  let service: ExerciseSubmissionsService;
  let http: HttpTestingController;
  const isAuthenticated = signal(true);

  beforeEach(() => {
    isAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated } },
      ],
    });
    service = TestBed.inject(ExerciseSubmissionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function load(): Promise<void> {
    const promise = service.loadSummary('course-1', 'block-3');
    http.expectOne(`${BASE}/summary`).flush({ total: 4, by_question: { 'q-1': 3, 'q-2': 1 } });
    await promise;
  }

  it('loads the summary of a block', async () => {
    await load();
    expect(service.summary()).toEqual({ total: 4, byQuestion: { 'q-1': 3, 'q-2': 1 } });
  });

  it('leaves the summary unknown on error', async () => {
    const promise = service.loadSummary('course-1', 'block-3');
    http.expectOne(`${BASE}/summary`).flush('nope', { status: 404, statusText: 'Not Found' });
    await promise;
    expect(service.summary()).toBeNull();
  });

  it('clears one question and patches the summary locally', async () => {
    await load();
    const promise = service.clear('course-1', 'block-3', 'q-1');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.params.get('question_id')).toBe('q-1');
    req.flush({ deleted: 3 });

    expect(await promise).toBe(3);
    expect(service.summary()).toEqual({ total: 1, byQuestion: { 'q-2': 1 } });
  });

  it('clears the whole block', async () => {
    await load();
    const promise = service.clear('course-1', 'block-3', null);
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('question_id')).toBe(false);
    req.flush({ deleted: 4 });

    expect(await promise).toBe(4);
    expect(service.summary()).toEqual({ total: 0, byQuestion: {} });
  });

  it('rejects on failure and keeps the summary', async () => {
    await load();
    const promise = service.clear('course-1', 'block-3', null);
    http.expectOne((r) => r.url === BASE).flush('boom', { status: 503, statusText: 'Down' });
    await expect(promise).rejects.toBeTruthy();
    expect(service.summary()?.total).toBe(4);
  });

  it('purges on sign-out', async () => {
    await load();
    isAuthenticated.set(false);
    TestBed.tick();
    expect(service.summary()).toBeNull();
  });
});
