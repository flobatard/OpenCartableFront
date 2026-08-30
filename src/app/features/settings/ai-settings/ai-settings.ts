import { Component, computed, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  baseUrlRequired,
  baseUrlVisible,
  buildAiCredentialsForm,
  isFormComplete,
  patchFormFromCredentials,
  payloadFromForm,
} from '../../../core/ai-credentials/ai-credentials-form';
import { AI_PROVIDERS } from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';

/**
 * Réglages de l'assistant IA (sous-page du hub « Paramètres ») : choix
 * DÉLIBÉRÉ entre l'IA par défaut de la plateforme (fallback serveur, quota
 * quotidien affiché « utilisés / autorisés », 0 = illimité) et sa propre
 * config — provider, modèle, clé API (chiffrée côté serveur, jamais
 * ré-affichée), base_url pour ollama/openai_compatible.
 *
 * Le mode est DÉRIVÉ du serveur (config enregistrée = « ma clé », sinon
 * « IA par défaut ») ; les radios ne changent que la vue — revenir à l'IA
 * par défaut passe par le bouton en deux temps qui SUPPRIME la config
 * (même `removeConfig` que le bouton Supprimer du formulaire).
 *
 * Contrat clé API : le champ est TOUJOURS vide à l'affichage ; quand une clé
 * est déjà enregistrée, le laisser vide la conserve (le payload omet
 * `api_key`) — le placeholder l'explique. « Enregistrer » n'est actif que si
 * le formulaire est complet ET modifié (snapshot JSON, motif page profil).
 */
@Component({
  selector: 'app-ai-settings',
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './ai-settings.html',
  styleUrl: './ai-settings.scss',
})
export class AiSettings implements OnInit {
  readonly #credentials = inject(AiCredentialsService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly providers = AI_PROVIDERS;

  /** Public : les specs jsdom pilotent les contrôles (convention du repo). */
  readonly form = buildAiCredentialsForm();

  /** Miroir signal du formulaire (réactivité zoneless des computed/template). */
  readonly #formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveSuccess = signal(false);
  /** Clé i18n de l'erreur de sauvegarde (`null` = pas d'erreur). */
  protected readonly saveErrorKey = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteArmed = signal(false);
  protected readonly deleteSuccess = signal(false);

  /** Snapshot JSON du dernier payload persisté (chargé ou sauvegardé). */
  readonly #savedPayload = signal<string | null>(null);

  protected readonly apiKeySet = computed(
    () => this.#credentials.credentials()?.api_key_set ?? false,
  );

  /** Une configuration existe côté serveur (le bouton Supprimer a un objet). */
  protected readonly hasStoredConfig = computed(
    () => this.#credentials.credentials()?.provider != null,
  );

  /** Mode affiché — posé au chargement depuis l'état serveur, puis par les radios. */
  protected readonly mode = signal<'default' | 'custom'>('custom');

  protected readonly defaultAvailable = computed(
    () => this.#credentials.credentials()?.default_ai_available ?? false,
  );
  protected readonly quotaTotal = computed(
    () => this.#credentials.credentials()?.daily_quota ?? 0,
  );
  protected readonly quotaUsed = computed(
    () => this.#credentials.credentials()?.calls_today ?? 0,
  );
  /** Quota quotidien 0 = illimité (contrat back). */
  protected readonly quotaUnlimited = computed(() => this.quotaTotal() === 0);

  protected readonly providerValue = computed(() => this.#formValue().provider ?? null);
  protected readonly showBaseUrl = computed(() => baseUrlVisible(this.providerValue()));
  protected readonly baseUrlIsRequired = computed(() => baseUrlRequired(this.providerValue()));

  protected readonly dirty = computed(() => {
    this.#formValue(); // dépendance : réévalué à chaque modification du formulaire
    return JSON.stringify(payloadFromForm(this.form)) !== this.#savedPayload();
  });

  protected readonly canSave = computed(
    () =>
      this.dirty() &&
      !this.saving() &&
      !this.deleting() &&
      isFormComplete(this.#formValue(), this.apiKeySet()),
  );

  constructor() {
    // Toute modification efface les messages de l'action précédente.
    this.form.valueChanges.subscribe(() => {
      this.saveSuccess.set(false);
      this.deleteSuccess.set(false);
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    await this.loadCredentials();
  }

  protected async loadCredentials(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const creds = await this.#credentials.ensureLoaded();
      patchFormFromCredentials(this.form, creds);
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      this.mode.set(creds.provider ? 'custom' : 'default');
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.saveErrorKey.set(null);
    try {
      await this.#credentials.save(payloadFromForm(this.form));
      // La clé vient d'être enregistrée (chiffrée) : le champ redevient vide,
      // le placeholder « clé enregistrée » prend le relais.
      this.form.controls.apiKey.setValue('');
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      this.saveSuccess.set(true);
    } catch (error) {
      this.saveErrorKey.set(this.#errorKey(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Bascule de vue par les radios ; efface les messages de l'action précédente. */
  protected selectMode(mode: 'default' | 'custom'): void {
    this.mode.set(mode);
    this.deleteArmed.set(false);
    this.saveSuccess.set(false);
    this.deleteSuccess.set(false);
    this.saveErrorKey.set(null);
  }

  /**
   * Suppression en deux temps sans modale, désarmée au blur (motif
   * ressources). Sert aussi de « Utiliser l'IA par défaut » : sans config
   * enregistrée, l'IA par défaut s'applique — la vue reste donc sur ce mode.
   */
  protected async removeConfig(): Promise<void> {
    if (!this.deleteArmed()) {
      this.deleteArmed.set(true);
      return;
    }
    this.deleteArmed.set(false);
    this.deleting.set(true);
    this.saveErrorKey.set(null);
    try {
      await this.#credentials.remove();
      this.form.reset({ provider: null, model: '', apiKey: '', baseUrl: '' });
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      this.deleteSuccess.set(true);
      this.mode.set('default');
    } catch (error) {
      this.saveErrorKey.set(this.#errorKey(error));
    } finally {
      this.deleting.set(false);
    }
  }

  protected disarmDelete(): void {
    this.deleteArmed.set(false);
  }

  #errorKey(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 422) {
      return 'settings.ai.errors.invalid';
    }
    if (status === 503) {
      return 'settings.ai.errors.unavailable';
    }
    return 'settings.ai.errors.generic';
  }
}
