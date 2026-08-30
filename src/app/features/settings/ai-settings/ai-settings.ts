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
 * Réglages de l'assistant IA (sous-page du hub « Paramètres ») : provider,
 * modèle, clé API (chiffrée côté serveur, jamais ré-affichée) et base_url
 * pour ollama/openai_compatible.
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

  protected readonly apiKeyDefinie = computed(
    () => this.#credentials.credentials()?.api_key_definie ?? false,
  );

  /** Une configuration existe côté serveur (le bouton Supprimer a un objet). */
  protected readonly hasStoredConfig = computed(
    () => this.#credentials.credentials()?.provider != null,
  );

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
      isFormComplete(this.#formValue(), this.apiKeyDefinie()),
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

  /** Suppression en deux temps sans modale, désarmée au blur (motif ressources). */
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
