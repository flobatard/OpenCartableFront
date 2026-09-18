import { HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  hasActivity,
  JobRun,
  MaintenanceJob,
  SKIP_REASONS,
  SkipReason,
} from '../../../core/admin/maintenance-jobs.model';
import { MaintenanceJobsService } from '../../../core/admin/maintenance-jobs.service';
import { armedAction } from '../../../core/editing/armed';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';

/**
 * Jobs du registre back dont le front connaît le libellé, la description et
 * le sens du compte (`admin.jobs.names.<nom>`). Un job ajouté côté back sans
 * mise à jour d'ici s'affiche sous son nom brut (contrat additif).
 */
const KNOWN_JOBS: ReadonlySet<string> = new Set([
  'ai_usage_counters',
  'tool_turn_content',
  'ai_conversations',
  'exercise_submissions',
  'share_links',
  'pending_resources',
  's3_orphans',
  'missing_s3_objects',
  'storage_inventory',
]);

/** Période du rafraîchissement automatique, tant qu'une passe est demandée ou en cours. */
export const ACTIVITY_POLL_MS = 5_000;

type JobActivity = 'running' | 'requested' | null;

/**
 * Backoffice « Jobs » : état du scheduler de maintenance et de chacun de ses
 * jobs (plan, rétention, dernière passe), et lancement manuel d'un job.
 *
 * Le lancement ne fait que DÉPOSER une demande (202) : le scheduler la relève
 * sous quelques secondes, derrière la passe en cours s'il y en a une. D'où le
 * rafraîchissement automatique — un `setTimeout` réarmé tant qu'un job est
 * demandé ou en cours, coupé au destroy —, et un bouton « Actualiser » sinon.
 * Confirmation en deux temps (`armedAction`, désarmée au blur) : une purge ne
 * se relance pas sur un clic égaré.
 */
@Component({
  selector: 'app-admin-jobs',
  imports: [TranslocoPipe],
  templateUrl: './admin-jobs.html',
  styleUrl: './admin-jobs.scss',
})
export class AdminJobs implements OnInit {
  readonly #jobs = inject(MaintenanceJobsService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly overview = this.#jobs.overview;
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly refreshing = signal(false);
  /** Job dont la demande est en vol (bouton gelé). */
  protected readonly submitting = signal<string | null>(null);
  /** Lancement en deux temps, par nom de job. */
  protected readonly runArmed = armedAction<string>();

  #pollTimer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      clearTimeout(this.#pollTimer);
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.#jobs.refresh();
      this.#schedulePoll();
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.#jobs.refresh();
      this.#schedulePoll();
    } catch {
      this.#notifications.error(this.#transloco.translate('admin.jobs.errors.refresh'));
    } finally {
      this.refreshing.set(false);
    }
  }

  /** Premier clic : arme ; second : dépose la demande. */
  protected async run(job: MaintenanceJob): Promise<void> {
    if (!this.runArmed.confirm(job.name)) {
      return;
    }
    this.submitting.set(job.name);
    try {
      await this.#jobs.run(job.name);
      this.#notifications.success(
        this.#transloco.translate('admin.jobs.requested', { job: this.jobLabel(job.name) }),
      );
      this.#schedulePoll();
    } catch (error) {
      this.#notifications.error(this.#transloco.translate(this.#runErrorKey(error)));
      // 409/503 : l'état a changé côté serveur — la vue se réaligne.
      void this.#refreshQuietly();
    } finally {
      this.submitting.set(null);
    }
  }

  protected activity(job: MaintenanceJob): JobActivity {
    if (this.overview()?.scheduler?.running_job === job.name) {
      return 'running';
    }
    return job.requested_at !== null ? 'requested' : null;
  }

  /**
   * Seul un canal de contrôle injoignable interdit de demander : sans statut
   * publié (scheduler arrêté), la demande attend son démarrage — personne ne
   * vérifie ici qu'il vit, c'est l'affaire de docker.
   */
  protected canRun(job: MaintenanceJob): boolean {
    return (
      this.overview()?.control_available === true &&
      this.submitting() === null &&
      this.activity(job) === null
    );
  }

  protected jobLabel(name: string): string {
    return KNOWN_JOBS.has(name)
      ? this.#transloco.translate(`admin.jobs.names.${name}.label`)
      : name;
  }

  protected jobDescription(name: string): string | null {
    return KNOWN_JOBS.has(name)
      ? this.#transloco.translate(`admin.jobs.names.${name}.description`)
      : null;
  }

  protected countLabel(job: MaintenanceJob, run: JobRun): string {
    const key = KNOWN_JOBS.has(job.name)
      ? `admin.jobs.names.${job.name}.count`
      : 'admin.jobs.count';
    return this.#transloco.translate(key, { count: this.formatNumber(run.count) });
  }

  /** Raison d'un saut traduite ; une erreur d'échec reste telle quelle (déjà expurgée). */
  protected errorText(run: JobRun): string | null {
    if (run.error === null) {
      return null;
    }
    return (SKIP_REASONS as readonly string[]).includes(run.error)
      ? this.#transloco.translate(`admin.jobs.skipReasons.${run.error as SkipReason}`)
      : run.error;
  }

  protected detailJson(run: JobRun): string {
    return JSON.stringify(run.detail, null, 2);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString(this.#language.lang(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(this.#language.lang());
  }

  protected formatNumber(value: number): string {
    return new Intl.NumberFormat(this.#language.lang()).format(value);
  }

  /** `850 ms`, `1,3 s`, `2 min 5 s` — assez pour situer une passe. */
  protected formatDuration(ms: number): string {
    const lang = this.#language.lang();
    if (ms < 1_000) {
      return `${ms} ms`;
    }
    if (ms < 60_000) {
      return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(ms / 1_000)} s`;
    }
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1_000);
    return `${minutes} min ${seconds} s`;
  }

  /** Réarme le rafraîchissement tant qu'une passe est demandée ou en cours. */
  #schedulePoll(): void {
    clearTimeout(this.#pollTimer);
    this.#pollTimer = undefined;
    if (this.#destroyed || !hasActivity(this.overview())) {
      return;
    }
    this.#pollTimer = setTimeout(() => void this.#refreshQuietly(), ACTIVITY_POLL_MS);
  }

  /** Relecture silencieuse : un échec garde la dernière vue et réessaie au tick suivant. */
  async #refreshQuietly(): Promise<void> {
    try {
      await this.#jobs.refresh();
    } catch {
      // Coupure passagère : la vue affichée reste la dernière connue.
    }
    this.#schedulePoll();
  }

  #runErrorKey(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 409) {
      return 'admin.jobs.errors.conflict';
    }
    if (status === 503) {
      return 'admin.jobs.errors.controlDown';
    }
    if (status === 403) {
      return 'admin.jobs.errors.forbidden';
    }
    return 'admin.jobs.errors.generic';
  }
}
