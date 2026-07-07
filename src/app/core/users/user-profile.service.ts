import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { OnboardingPayload, UserProfile } from './user-profile.model';

/**
 * Profil de l'utilisateur courant — variante MUTABLE du patron `SubjectService` :
 * pas de `shareReplay` figé, mais un signal source de vérité que les mutations
 * remplacent (le `PUT` renvoie le profil à jour, pas de refetch), et une
 * promesse en vol partagée pour que callback + guard n'émettent qu'un GET.
 * Le profil est purgé quand la session OIDC tombe (logout / expiration).
 *
 * Le Bearer est attaché automatiquement par l'intercepteur OIDC (URL sous
 * `environment.apiUrl`) ; le service n'est sollicité que depuis des contextes
 * navigateur (callback post-login, guards, pages protégées).
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/users/me`;

  #inflight: Promise<UserProfile> | undefined;

  readonly #profile = signal<UserProfile | null>(null);
  /** Profil chargé (`null` tant qu'aucun GET n'a abouti ou après logout). */
  readonly profile = this.#profile.asReadonly();

  readonly onboardingComplete = computed(() => this.#profile()?.onboarding_complete ?? false);

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#profile.set(null);
        this.#inflight = undefined;
      }
    });
  }

  /**
   * Retourne le profil, en le chargeant au premier appel (le back
   * auto-provisionne la ligne `users`). Les appels concurrents partagent la
   * même requête ; une erreur invalide la promesse pour permettre un retry.
   */
  ensureLoaded(): Promise<UserProfile> {
    const cached = this.#profile();
    if (cached) {
      return Promise.resolve(cached);
    }
    this.#inflight ??= firstValueFrom(this.#http.get<UserProfile>(this.#url)).then(
      (profile) => {
        this.#profile.set(profile);
        return profile;
      },
      (error: unknown) => {
        this.#inflight = undefined;
        throw error;
      },
    );
    return this.#inflight;
  }

  /**
   * Soumet l'onboarding initial OU une édition du profil (le PUT a une
   * sémantique de remplacement complet) ; la réponse remplace le signal.
   */
  async saveProfile(payload: OnboardingPayload): Promise<UserProfile> {
    const profile = await firstValueFrom(
      this.#http.put<UserProfile>(`${this.#url}/profile`, payload),
    );
    this.#profile.set(profile);
    return profile;
  }

  /** Force un rechargement (invalide profil et requête en vol). */
  reload(): Promise<UserProfile> {
    this.#profile.set(null);
    this.#inflight = undefined;
    return this.ensureLoaded();
  }
}
