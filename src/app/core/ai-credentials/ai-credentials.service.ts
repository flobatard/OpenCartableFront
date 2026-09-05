import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  AiCredentials,
  AiCredentialsPayload,
  AiModelListPayload,
  EMPTY_AI_CREDENTIALS,
} from './ai-credentials.model';

/**
 * Credential IA de l'utilisateur courant — variante MUTABLE mono-ressource du
 * patron (`UserProfileService` réduit) : signal source de vérité,
 * promesse en vol partagée (`ensureLoaded()`, invalidée sur erreur pour le
 * retry), mutations qui remplacent le signal depuis la réponse (pas de
 * refetch), purge quand la session OIDC tombe.
 *
 * Le Bearer est attaché automatiquement par l'intercepteur OIDC (URL sous
 * `environment.apiUrl`). La clé API saisie ne fait que TRANSITER dans le
 * payload du PUT : l'API ne la renvoie jamais (`api_key_set` seul).
 */
@Injectable({ providedIn: 'root' })
export class AiCredentialsService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/users/me/ai-credentials`;

  #inflight: Promise<AiCredentials> | undefined;

  readonly #credentials = signal<AiCredentials | null>(null);
  /** Credential chargé (`null` tant qu'aucun GET n'a abouti ou après logout). */
  readonly credentials = this.#credentials.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#credentials.set(null);
        this.#inflight = undefined;
      }
    });
  }

  /**
   * Retourne le credential (le GET répond 200 même sans configuration —
   * champs `null` + `api_key_set: false`). Appels concurrents partagés.
   */
  ensureLoaded(): Promise<AiCredentials> {
    const cached = this.#credentials();
    if (cached) {
      return Promise.resolve(cached);
    }
    this.#inflight ??= firstValueFrom(this.#http.get<AiCredentials>(this.#url)).then(
      (credentials) => {
        this.#credentials.set(credentials);
        return credentials;
      },
      (error: unknown) => {
        this.#inflight = undefined;
        throw error;
      },
    );
    return this.#inflight;
  }

  /**
   * Relit le credential depuis le serveur (compteur de quota du jour compris)
   * et remplace le signal — utilisé par le panneau assistant après un tour
   * servi par l'IA par défaut, dont le back vient de consommer le quota.
   * L'échec est relayé (le signal garde alors sa dernière valeur).
   */
  async refresh(): Promise<AiCredentials> {
    const credentials = await firstValueFrom(this.#http.get<AiCredentials>(this.#url));
    this.#credentials.set(credentials);
    return credentials;
  }

  /**
   * Enregistre le credential ; un payload SANS `api_key` conserve la clé déjà
   * enregistrée côté serveur. La réponse remplace le signal.
   */
  async save(payload: AiCredentialsPayload): Promise<AiCredentials> {
    const credentials = await firstValueFrom(
      this.#http.put<AiCredentials>(this.#url, payload),
    );
    this.#credentials.set(credentials);
    return credentials;
  }

  /**
   * Supprime toute la configuration (204) puis RELIT le credential : la
   * suppression bascule l'utilisateur sur l'IA par défaut, dont l'état
   * (disponibilité, quota du jour) doit être frais — l'état vide local ne le
   * connaît pas. Si la relecture échoue, repli sur l'état vide (la
   * suppression, elle, a réussi).
   */
  async remove(): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(this.#url));
    try {
      this.#credentials.set(await firstValueFrom(this.#http.get<AiCredentials>(this.#url)));
    } catch {
      this.#credentials.set(EMPTY_AI_CREDENTIALS);
    }
  }

  /**
   * Teste la config du formulaire par un mini-appel provider côté serveur —
   * même corps que le PUT (`api_key` omise = tester avec la clé enregistrée),
   * jamais de quota. Sans effet sur le signal : rien n'est persisté ; l'échec
   * (HttpErrorResponse 400/422/429/503) est relayé à l'appelant.
   */
  async testConnection(payload: AiCredentialsPayload): Promise<void> {
    await firstValueFrom(this.#http.post<{ ok: boolean }>(`${this.#url}/test`, payload));
  }

  /**
   * Modèles proposés par le provider (auto-complétion du champ modèle) —
   * POST : la clé voyage en body, jamais en query. Sans effet sur le signal.
   */
  async listModels(payload: AiModelListPayload): Promise<string[]> {
    const response = await firstValueFrom(
      this.#http.post<{ models: string[] }>(`${this.#url}/models`, payload),
    );
    return response.models;
  }
}
