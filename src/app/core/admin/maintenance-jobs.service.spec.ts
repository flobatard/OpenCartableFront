import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { MAINTENANCE_OVERVIEW_FIXTURE } from '../../testing/maintenance-jobs.fixture';
import { AuthService } from '../auth/auth.service';
import { hasActivity, MaintenanceOverview } from './maintenance-jobs.model';
import { MaintenanceJobsService } from './maintenance-jobs.service';

describe('MaintenanceJobsService', () => {
  let service: MaintenanceJobsService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/admin/maintenance/jobs`;

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        MaintenanceJobsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(MaintenanceJobsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('refresh GETs the overview and replaces the signal', async () => {
    const loaded = service.refresh();
    httpMock.expectOne(url).flush(MAINTENANCE_OVERVIEW_FIXTURE);

    expect(await loaded).toEqual(MAINTENANCE_OVERVIEW_FIXTURE);
    expect(service.overview()).toEqual(MAINTENANCE_OVERVIEW_FIXTURE);
  });

  it('run POSTs to the job and replaces the signal with the returned overview', async () => {
    const requested: MaintenanceOverview = {
      ...MAINTENANCE_OVERVIEW_FIXTURE,
      jobs: MAINTENANCE_OVERVIEW_FIXTURE.jobs.map((job) =>
        job.name === 'storage_inventory' ? { ...job, requested_at: '2026-09-18T10:00:00Z' } : job,
      ),
    };

    const submit = service.run('storage_inventory');
    const req = httpMock.expectOne(`${url}/storage_inventory/run`);
    expect(req.request.method).toBe('POST');
    req.flush(requested, { status: 202, statusText: 'Accepted' });

    expect(await submit).toEqual(requested);
    expect(service.overview()).toEqual(requested);
  });

  it('run refuses a name that is not a registry job name (never interpolated)', async () => {
    await expect(service.run('../users/me')).rejects.toThrow();
    httpMock.expectNone(`${url}/../users/me/run`);
  });

  it('run relays a refusal and keeps the last overview', async () => {
    const loaded = service.refresh();
    httpMock.expectOne(url).flush(MAINTENANCE_OVERVIEW_FIXTURE);
    await loaded;

    const submit = service.run('share_links');
    httpMock
      .expectOne(`${url}/share_links/run`)
      .flush({ detail: 'down' }, { status: 503, statusText: 'Service Unavailable' });

    await expect(submit).rejects.toMatchObject({ status: 503 });
    expect(service.overview()).toEqual(MAINTENANCE_OVERVIEW_FIXTURE);
  });

  it('clears the overview when the session drops', async () => {
    const loaded = service.refresh();
    httpMock.expectOne(url).flush(MAINTENANCE_OVERVIEW_FIXTURE);
    await loaded;

    isAuthenticated.set(false);
    TestBed.tick();

    expect(service.overview()).toBeNull();
  });
});

describe('hasActivity', () => {
  it('is false for an idle scheduler, or one without a published status', () => {
    expect(hasActivity(MAINTENANCE_OVERVIEW_FIXTURE)).toBe(false);
    expect(hasActivity({ ...MAINTENANCE_OVERVIEW_FIXTURE, scheduler: null })).toBe(false);
    expect(hasActivity(null)).toBe(false);
  });

  it('is true while a job runs or waits in the queue', () => {
    const running: MaintenanceOverview = {
      ...MAINTENANCE_OVERVIEW_FIXTURE,
      scheduler: {
        ...MAINTENANCE_OVERVIEW_FIXTURE.scheduler!,
        running_job: 's3_orphans',
        running_since: '2026-09-18T10:00:00Z',
      },
    };
    const requested: MaintenanceOverview = {
      ...MAINTENANCE_OVERVIEW_FIXTURE,
      jobs: [{ ...MAINTENANCE_OVERVIEW_FIXTURE.jobs[0], requested_at: '2026-09-18T10:00:00Z' }],
    };
    expect(hasActivity(running)).toBe(true);
    expect(hasActivity(requested)).toBe(true);
  });
});
