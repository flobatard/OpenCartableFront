import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { MaintenanceOverview } from './maintenance-jobs.model';

/** Forme d'un nom de job du registre back — garde avant toute interpolation d'URL. */
const JOB_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Jobs de maintenance vus du backoffice — variante mutable du patron, sur une
 * ENVELOPPE : le signal porte la vue d'ensemble (état du scheduler et de
 * chaque job), relue à chaque entrée de page et à chaque rafraîchissement ;
 * la demande de passe renvoie la vue à jour, qui remplace le signal. Purge
 * quand la session OIDC tombe.
 *
 * L'API n'exécute rien elle-même : `run` dépose une demande que le scheduler
 * relève (quelques secondes plus tard). Bearer automatique (URL sous
 * `environment.apiUrl`) ; un compte sans le rôle `super_admin` reçoit un 403.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceJobsService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/admin/maintenance/jobs`;

  readonly #overview = signal<MaintenanceOverview | null>(null);
  /** Dernière vue chargée (`null` tant qu'aucun GET n'a abouti, ou après logout). */
  readonly overview = this.#overview.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#overview.set(null);
      }
    });
  }

  /** Relit la vue et remplace le signal ; l'échec est relayé (le signal garde sa valeur). */
  async refresh(): Promise<MaintenanceOverview> {
    const overview = await firstValueFrom(this.#http.get<MaintenanceOverview>(this.#url));
    this.#overview.set(overview);
    return overview;
  }

  /**
   * Demande une passe manuelle (202) ; la vue renvoyée remplace le signal.
   * Échecs relayés : 409 (déjà demandé ou en cours), 503 (scheduler absent).
   */
  async run(jobName: string): Promise<MaintenanceOverview> {
    if (!JOB_NAME_PATTERN.test(jobName)) {
      throw new Error('Nom de job de maintenance invalide');
    }
    const overview = await firstValueFrom(
      this.#http.post<MaintenanceOverview>(`${this.#url}/${jobName}/run`, null),
    );
    this.#overview.set(overview);
    return overview;
  }
}
