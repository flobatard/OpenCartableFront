import { MaintenanceOverview } from '../core/admin/maintenance-jobs.model';

/**
 * Vue d'ensemble de référence : canal de contrôle joignable, statut publié par
 * un scheduler au repos, quatre jobs qui couvrent les cas d'affichage — succès
 * avec détail, échec, tâche désactivée (rétention 0, passe sautée), contrôle
 * jamais passé.
 */
export const MAINTENANCE_OVERVIEW_FIXTURE: MaintenanceOverview = {
  control_available: true,
  scheduler: {
    started_at: '2026-09-18T06:00:00Z',
    timezone: 'Europe/Paris',
    running_job: null,
    running_since: null,
  },
  jobs: [
    {
      name: 'share_links',
      cron: '20 3 * * *',
      retention_days: 365,
      next_run_at: '2026-09-19T01:20:00Z',
      requested_at: null,
      last_run: {
        started_at: '2026-09-18T01:20:00Z',
        finished_at: '2026-09-18T01:20:01Z',
        status: 'ok',
        count: 4,
        duration_ms: 1250,
        error: null,
        detail: { purged: 4 },
        consecutive_failures: 0,
        total_runs: 12,
      },
    },
    {
      name: 's3_orphans',
      cron: '10 1 * * sat',
      retention_days: 90,
      next_run_at: '2026-09-19T23:10:00Z',
      requested_at: null,
      last_run: {
        started_at: '2026-09-12T23:10:00Z',
        finished_at: '2026-09-12T23:10:04Z',
        status: 'failed',
        count: 0,
        duration_ms: 4000,
        error: 'EndpointConnectionError: Could not connect to the endpoint URL',
        detail: null,
        consecutive_failures: 2,
        total_runs: 3,
      },
    },
    {
      name: 'ai_conversations',
      cron: '40 3 * * *',
      retention_days: 0,
      next_run_at: '2026-09-19T01:40:00Z',
      requested_at: null,
      last_run: {
        started_at: '2026-09-18T01:40:00Z',
        finished_at: '2026-09-18T01:40:00Z',
        status: 'skipped',
        count: 0,
        duration_ms: 0,
        error: 'retention_disabled',
        detail: null,
        consecutive_failures: 0,
        total_runs: 8,
      },
    },
    {
      name: 'storage_inventory',
      cron: '40 4 * * mon',
      retention_days: null,
      next_run_at: '2026-09-21T02:40:00Z',
      requested_at: null,
      last_run: null,
    },
  ],
};
