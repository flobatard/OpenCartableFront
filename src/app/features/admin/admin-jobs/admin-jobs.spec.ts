import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { MaintenanceOverview } from '../../../core/admin/maintenance-jobs.model';
import { MaintenanceJobsService } from '../../../core/admin/maintenance-jobs.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { MAINTENANCE_OVERVIEW_FIXTURE } from '../../../testing/maintenance-jobs.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { ACTIVITY_POLL_MS, AdminJobs } from './admin-jobs';

const IDLE = MAINTENANCE_OVERVIEW_FIXTURE;

/** `share_links` attend dans la file du scheduler. */
const REQUESTED: MaintenanceOverview = {
  ...IDLE,
  jobs: IDLE.jobs.map((job) =>
    job.name === 'share_links' ? { ...job, requested_at: '2026-09-18T10:00:00Z' } : job,
  ),
};

describe('AdminJobs', () => {
  let overview: ReturnType<typeof signal<MaintenanceOverview | null>>;
  let service: {
    overview: ReturnType<typeof signal<MaintenanceOverview | null>>;
    refresh: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  /** Le service rend (et publie) `loaded` à chaque relecture. */
  function setup(loaded: MaintenanceOverview): ComponentFixture<AdminJobs> {
    overview = signal<MaintenanceOverview | null>(null);
    service = {
      overview,
      refresh: vi.fn(async () => {
        overview.set(loaded);
        return loaded;
      }),
      run: vi.fn(),
    };
    notifications = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AdminJobs, provideTranslocoTesting()],
      providers: [
        { provide: MaintenanceJobsService, useValue: service },
        { provide: NotificationService, useValue: notifications },
        { provide: LanguageService, useValue: { lang: signal('fr').asReadonly() } },
      ],
    });
    return TestBed.createComponent(AdminJobs);
  }

  async function render(fixture: ComponentFixture<AdminJobs>): Promise<HTMLElement> {
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rows(el: HTMLElement): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>('.admin-jobs__row')];
  }

  function row(el: HTMLElement, label: string): HTMLElement {
    return rows(el).find(
      (r) => r.querySelector('.admin-jobs__name')?.textContent?.trim() === label,
    )!;
  }

  function runButton(el: HTMLElement, label: string): HTMLButtonElement {
    return row(el, label).querySelector<HTMLButtonElement>('.admin-jobs__run')!;
  }

  afterEach(() => vi.restoreAllMocks());

  it('lists every job of the overview, in order, under translated names', async () => {
    const el = await render(setup(IDLE));

    expect(service.refresh).toHaveBeenCalledOnce();
    expect(el.querySelector('h1')?.textContent).toContain('Jobs de maintenance');
    expect(rows(el).map((r) => r.querySelector('.admin-jobs__name')?.textContent?.trim())).toEqual([
      'Liens de partage expirés',
      'Orphelins du bucket S3',
      "Conversations de l'assistant",
      'Inventaire de volumétrie',
    ]);
    expect(el.querySelector('.admin-jobs__scheduler-state')?.textContent).toContain(
      'Scheduler démarré le',
    );
    expect(el.querySelector('.admin-jobs__scheduler')?.textContent).toContain(
      'aucune passe en cours',
    );
  });

  it('shows the last pass: status in words, count meaning, detail', async () => {
    const el = await render(setup(IDLE));

    const shareLinks = row(el, 'Liens de partage expirés');
    expect(shareLinks.querySelector('.admin-jobs__run-status')?.textContent?.trim()).toBe(
      'Réussie',
    );
    expect(shareLinks.textContent).toContain('liens supprimés : 4');
    expect(shareLinks.textContent).toContain('365 jours');
    expect(shareLinks.querySelector('.admin-jobs__detail pre')?.textContent).toContain(
      '"purged": 4',
    );
  });

  it('shows a failure with its error and the consecutive failures', async () => {
    const el = await render(setup(IDLE));

    const orphans = row(el, 'Orphelins du bucket S3');
    expect(orphans.querySelector('.admin-jobs__run-status')?.textContent?.trim()).toBe('Échec');
    expect(orphans.querySelector('.admin-jobs__error--failed')?.textContent).toContain(
      'EndpointConnectionError',
    );
    expect(orphans.querySelector('.admin-jobs__failures')?.textContent).toContain(
      'Échecs consécutifs : 2',
    );
  });

  it('translates the reason of a skipped pass and the disabled retention', async () => {
    const el = await render(setup(IDLE));

    const conversations = row(el, "Conversations de l'assistant");
    expect(conversations.querySelector('.admin-jobs__run-status')?.textContent?.trim()).toBe(
      'Sautée',
    );
    expect(conversations.querySelector('.admin-jobs__error')?.textContent).toContain(
      'la tâche est désactivée (rétention 0)',
    );
    expect(conversations.textContent).toContain('désactivée (rétention 0)');
  });

  it('shows a check that never ran', async () => {
    const el = await render(setup(IDLE));

    const inventory = row(el, 'Inventaire de volumétrie');
    expect(inventory.textContent).toContain('jamais exécuté');
    expect(inventory.textContent).toContain('contrôle en lecture seule');
  });

  it('falls back to the raw name of a job the front does not know', async () => {
    const unknown: MaintenanceOverview = {
      ...IDLE,
      jobs: [{ ...IDLE.jobs[3], name: 'future_job' }],
    };
    const el = await render(setup(unknown));

    expect(rows(el)[0].querySelector('.admin-jobs__name')?.textContent?.trim()).toBe('future_job');
  });

  it('offers a retry when the overview cannot be loaded', async () => {
    const fixture = setup(IDLE);
    service.refresh.mockRejectedValueOnce(new Error('down'));
    const el = await render(fixture);

    expect(el.querySelector('.admin-jobs__load-error')).not.toBeNull();
    const retry = [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Réessayer',
    )!;
    retry.click();
    await render(fixture);

    expect(service.refresh).toHaveBeenCalledTimes(2);
    expect(rows(el)).toHaveLength(4);
  });

  it('runs a job in two clicks and says the request was filed', async () => {
    const fixture = setup(IDLE);
    let el = await render(fixture);
    service.run.mockResolvedValue(REQUESTED);

    runButton(el, 'Liens de partage expirés').click();
    el = await render(fixture);
    expect(service.run).not.toHaveBeenCalled();
    expect(runButton(el, 'Liens de partage expirés').textContent?.trim()).toBe(
      'Confirmer le lancement',
    );

    runButton(el, 'Liens de partage expirés').click();
    await render(fixture);

    expect(service.run).toHaveBeenCalledWith('share_links');
    expect(notifications.success).toHaveBeenCalledWith(
      expect.stringContaining('Passe demandée : Liens de partage expirés'),
    );
  });

  it('explains a refused run and realigns the view', async () => {
    const fixture = setup(IDLE);
    const el = await render(fixture);
    service.run.mockRejectedValue(new HttpErrorResponse({ status: 409 }));

    runButton(el, 'Liens de partage expirés').click();
    runButton(el, 'Liens de partage expirés').click();
    await render(fixture);

    expect(notifications.error).toHaveBeenCalledWith('Ce job est déjà demandé ou en cours.');
    expect(service.refresh).toHaveBeenCalledTimes(2);
  });

  it('shows a requested or running job and freezes its button', async () => {
    const running: MaintenanceOverview = {
      ...REQUESTED,
      scheduler: {
        ...REQUESTED.scheduler!,
        running_job: 's3_orphans',
        running_since: '2026-09-18T10:00:00Z',
      },
    };
    const el = await render(setup(running));

    expect(
      row(el, 'Liens de partage expirés').querySelector('.admin-jobs__activity')?.textContent,
    ).toContain('Demandé');
    expect(
      row(el, 'Orphelins du bucket S3').querySelector('.admin-jobs__activity')?.textContent,
    ).toContain('En cours');
    expect(runButton(el, 'Liens de partage expirés').disabled).toBe(true);
    expect(runButton(el, 'Orphelins du bucket S3').disabled).toBe(true);
    expect(runButton(el, 'Inventaire de volumétrie').disabled).toBe(false);
    expect(el.querySelector('.admin-jobs__scheduler')?.textContent).toContain(
      'en cours : Orphelins du bucket S3',
    );
  });

  it('disables every run while the control channel is down, and says why', async () => {
    const down: MaintenanceOverview = {
      ...IDLE,
      control_available: false,
      scheduler: null,
      jobs: IDLE.jobs.map((job) => ({ ...job, next_run_at: null })),
    };
    const el = await render(setup(down));

    const banner = el.querySelector('.admin-jobs__scheduler')!;
    expect(banner.classList).toContain('admin-jobs__scheduler--down');
    expect(banner.textContent).toContain('Canal de contrôle injoignable');
    expect(banner.textContent).toContain("L'état des dernières passes reste affiché");
    expect(
      [...el.querySelectorAll<HTMLButtonElement>('.admin-jobs__run')].every((b) => b.disabled),
    ).toBe(true);
    // L'état des passes vient de Postgres : il reste affiché.
    expect(rows(el)).toHaveLength(4);
  });

  it('still accepts runs when the scheduler published no status', async () => {
    // Personne ne vérifie ici que le scheduler vit (c'est l'affaire de docker) :
    // la demande attendra son démarrage.
    const unknown: MaintenanceOverview = {
      ...IDLE,
      scheduler: null,
      jobs: IDLE.jobs.map((job) => ({ ...job, next_run_at: null })),
    };
    const el = await render(setup(unknown));

    const banner = el.querySelector('.admin-jobs__scheduler')!;
    expect(banner.classList).toContain('admin-jobs__scheduler--unknown');
    expect(banner.textContent).toContain('Aucun statut publié par le scheduler');
    expect(runButton(el, 'Liens de partage expirés').disabled).toBe(false);
    // Sans statut, pas de « non planifié » hasardeux : le plan est inconnu.
    expect(row(el, 'Liens de partage expirés').textContent).not.toContain('non planifié');
  });

  it('refreshes on its own while a pass is requested, and stops once idle', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await render(setup(REQUESTED));

    const poll = setTimeoutSpy.mock.calls.find(([, delay]) => delay === ACTIVITY_POLL_MS);
    expect(poll).toBeDefined();

    service.refresh.mockImplementation(async () => {
      overview.set(IDLE);
      return IDLE;
    });
    setTimeoutSpy.mockClear();
    (poll![0] as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.refresh).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === ACTIVITY_POLL_MS)).toBe(false);
  });

  it('does not poll an idle scheduler, and stops polling on destroy', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const fixture = setup(IDLE);
    await render(fixture);
    expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === ACTIVITY_POLL_MS)).toBe(false);

    fixture.destroy();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
