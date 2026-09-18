/**
 * Vue d'ensemble des jobs de maintenance, servie au backoffice
 * (`GET /api/v1/admin/maintenance/jobs`, rôle de plateforme `super_admin`).
 * Miroir de `app/admin/schemas.py` du back, champs en snake_case tels quels ;
 * les dates sont des ISO 8601.
 */
export type JobRunStatus = 'ok' | 'failed' | 'skipped';

/** Raisons d'un `skipped`, rangées dans `error` (miroir de `app/maintenance/results.py`). */
export const SKIP_REASONS = ['retention_disabled', 'schema_not_current', 'busy'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/**
 * Statut publié par le scheduler (dans Redis) à son démarrage, puis au début
 * et à la fin de chaque passe. Ce n'est PAS une preuve de vie : personne ne
 * vérifie que le scheduler tourne — c'est l'affaire de docker.
 */
export interface SchedulerStatus {
  started_at: string;
  /** Fuseau résolu des expressions cron, tel que le scheduler l'applique. */
  timezone: string;
  running_job: string | null;
  running_since: string | null;
}

export interface JobRun {
  started_at: string;
  finished_at: string;
  status: JobRunStatus;
  count: number;
  duration_ms: number;
  /** `Type: message` tronqué sur un échec, `SkipReason` sur un saut, `null` sur un succès. */
  error: string | null;
  detail: Record<string, unknown> | null;
  consecutive_failures: number;
  total_runs: number;
}

export interface MaintenanceJob {
  /** Identifiant anglais du registre back ; le libellé est traduit côté front. */
  name: string;
  /** Expression cron configurée, telle quelle (vide, `off`… = non planifié). */
  cron: string;
  /** Jours ; `null` = contrôle en lecture seule ; `≤ 0` = tâche désactivée. */
  retention_days: number | null;
  /** Prochaine occurrence publiée par le scheduler ; `null` = non planifié, ou aucun statut. */
  next_run_at: string | null;
  /** Demande de passe manuelle en attente (elle expire si personne ne la prend). */
  requested_at: string | null;
  last_run: JobRun | null;
}

export interface MaintenanceOverview {
  /**
   * Canal de contrôle (Redis) joignable ? `false` : ni statut ni demandes
   * lisibles, lancements refusés — l'état des passes, lui, reste servi.
   */
  control_available: boolean;
  /** Dernier statut publié ; `null` = scheduler arrêté, pas encore démarré, ou canal indisponible. */
  scheduler: SchedulerStatus | null;
  /** Dans l'ordre du registre back. */
  jobs: MaintenanceJob[];
}

/** Une passe est-elle demandée ou en cours ? Tant que oui, la page se rafraîchit seule. */
export function hasActivity(overview: MaintenanceOverview | null): boolean {
  if (!overview) {
    return false;
  }
  return (
    (overview.scheduler?.running_job ?? null) !== null ||
    overview.jobs.some((job) => job.requested_at !== null)
  );
}
