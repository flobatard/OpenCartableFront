import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  AvatarMime,
  avatarMimeOf,
  AvatarPresign,
  MAX_AVATAR_BYTES,
  OnboardingPayload,
  UserProfile,
} from './user-profile.model';

/**
 * Phases de la mutation d'avatar en cours (une seule à la fois) : `progress`
 * n'est significatif que pendant `uploading` (comme `UploadState` des
 * ressources).
 */
export interface AvatarState {
  phase: 'idle' | 'presigning' | 'uploading' | 'confirming' | 'deleting' | 'error';
  progress: number;
}

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

  readonly #avatarState = signal<AvatarState>({ phase: 'idle', progress: 0 });
  readonly avatarState = this.#avatarState.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#profile.set(null);
        this.#inflight = undefined;
        this.#avatarState.set({ phase: 'idle', progress: 0 });
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

  /**
   * Upload de la photo de profil : presign → PUT direct navigateur→S3
   * (hors `apiUrl`, donc SANS Bearer — voulu ; `Content-Type` strictement
   * le mime déclaré, figé dans la signature) → confirm, dont la réponse
   * (profil complet, `avatar_url` posée) remplace le signal — motif
   * `saveProfile`, hors du cycle dirty du formulaire profil. Le blob vient
   * de la modale de recadrage : un carré WebP, ou PNG si le navigateur
   * n'encode pas le WebP — le mime est donc LU sur le blob (`avatarMimeOf`)
   * et non supposé, presign et PUT partageant la même valeur (sinon 409 au
   * confirm, qui compare le `ContentType` de l'objet S3 au mime déclaré).
   */
  async uploadAvatar(blob: Blob): Promise<UserProfile> {
    if (blob.size > MAX_AVATAR_BYTES) {
      // Garde défensive locale : aucun appel réseau pour un export hors gabarit.
      this.#avatarState.set({ phase: 'error', progress: 0 });
      throw new Error('avatar too large');
    }
    const mime = avatarMimeOf(blob);
    this.#avatarState.set({ phase: 'presigning', progress: 0 });
    try {
      const presign = await firstValueFrom(
        this.#http.post<AvatarPresign>(`${this.#url}/avatar`, {
          mime,
          size: blob.size,
        }),
      );

      this.#avatarState.set({ phase: 'uploading', progress: 0 });
      await this.#putToS3(presign.upload_url, blob, mime);

      this.#avatarState.set({ phase: 'confirming', progress: 100 });
      const profile = await firstValueFrom(
        this.#http.post<UserProfile>(`${this.#url}/avatar/confirm`, null),
      );
      this.#profile.set(profile);
      this.#avatarState.set({ phase: 'idle', progress: 0 });
      return profile;
    } catch (error) {
      this.#avatarState.set({ phase: 'error', progress: 0 });
      throw error;
    }
  }

  /** Supprime la photo de profil ; la réponse remplace le signal. */
  async deleteAvatar(): Promise<UserProfile> {
    this.#avatarState.set({ phase: 'deleting', progress: 0 });
    try {
      const profile = await firstValueFrom(
        this.#http.delete<UserProfile>(`${this.#url}/avatar`),
      );
      this.#profile.set(profile);
      this.#avatarState.set({ phase: 'idle', progress: 0 });
      return profile;
    } catch (error) {
      this.#avatarState.set({ phase: 'error', progress: 0 });
      throw error;
    }
  }

  /**
   * PUT du blob sur l'URL présignée, progression relayée dans `avatarState`.
   * Duplication assumée du `#putToS3` de `ResourceService` : on ne couple
   * pas les deux services pour si peu (comme `subject.utils`).
   */
  #putToS3(uploadUrl: string, blob: Blob, mime: AvatarMime): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#http
        .put(uploadUrl, blob, {
          headers: new HttpHeaders({ 'Content-Type': mime }),
          reportProgress: true,
          observe: 'events',
          responseType: 'text',
        })
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress && event.total) {
              this.#avatarState.set({
                phase: 'uploading',
                progress: Math.round((event.loaded / event.total) * 100),
              });
            }
          },
          error: reject,
          complete: () => resolve(),
        });
    });
  }
}
