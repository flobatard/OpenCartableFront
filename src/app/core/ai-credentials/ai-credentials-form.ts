import { FormControl, FormGroup } from '@angular/forms';
import {
  AiCredentials,
  AiCredentialsPayload,
  AiModelListPayload,
  AiProvider,
  PROVIDERS_KEY_OPTIONAL,
  PROVIDERS_WITH_BASE_URL,
  PROVIDERS_WITH_MODEL_LISTING,
} from './ai-credentials.model';

/**
 * Helpers purs du formulaire de credential IA (motif `profile-form.ts`).
 *
 * Contrat clé API : elle n'est JAMAIS renvoyée par l'API, donc jamais
 * patchée dans le formulaire ; un champ laissé vide signifie « conserver la
 * clé enregistrée » et le payload OMET alors `api_key`.
 */

export function buildAiCredentialsForm() {
  return new FormGroup({
    provider: new FormControl<AiProvider | null>(null),
    model: new FormControl('', { nonNullable: true }),
    apiKey: new FormControl('', { nonNullable: true }),
    baseUrl: new FormControl('', { nonNullable: true }),
  });
}

export type AiCredentialsForm = ReturnType<typeof buildAiCredentialsForm>;

/** Pré-remplit provider/modèle/base_url — la clé, jamais relue, reste vide. */
export function patchFormFromCredentials(form: AiCredentialsForm, creds: AiCredentials): void {
  form.controls.provider.setValue(creds.provider);
  form.controls.model.setValue(creds.model ?? '');
  form.controls.baseUrl.setValue(creds.base_url ?? '');
  form.controls.apiKey.setValue('');
}

/** Le champ base_url n'est proposé que pour ollama / openai_compatible. */
export function baseUrlVisible(provider: AiProvider | null): boolean {
  return provider !== null && PROVIDERS_WITH_BASE_URL.includes(provider);
}

export function baseUrlRequired(provider: AiProvider | null): boolean {
  return provider === 'openai_compatible';
}

/** Clé requise pour un provider cloud tant qu'aucune clé n'est enregistrée. */
export function keyRequired(provider: AiProvider | null, apiKeySet: boolean): boolean {
  if (provider === null || PROVIDERS_KEY_OPTIONAL.includes(provider)) {
    return false;
  }
  return !apiKeySet;
}

/**
 * Corps du `PUT /users/me/ai-credentials` : `api_key` OMISE si le champ est
 * vide (= conserver la clé enregistrée) ; base_url vidée pour les providers
 * qui ne l'acceptent pas (le back la refuserait en 422).
 */
export function payloadFromForm(form: AiCredentialsForm): AiCredentialsPayload {
  const v = form.getRawValue();
  const provider = v.provider as AiProvider;
  const payload: AiCredentialsPayload = {
    provider,
    model: v.model.trim(),
    base_url: baseUrlVisible(provider) ? v.baseUrl.trim() || null : null,
  };
  const apiKey = v.apiKey.trim();
  if (apiKey) {
    payload.api_key = apiKey;
  }
  return payload;
}

/** Règles de complétude (mêmes que la validation back). */
export function isFormComplete(v: AiCredentialsForm['value'], apiKeySet: boolean): boolean {
  const provider = v.provider ?? null;
  if (!provider || !v.model?.trim()) {
    return false;
  }
  if (keyRequired(provider, apiKeySet) && !v.apiKey?.trim()) {
    return false;
  }
  if (baseUrlRequired(provider) && !v.baseUrl?.trim()) {
    return false;
  }
  return true;
}

/** L'auto-complétion des modèles est proposée pour ce provider. */
export function modelListingSupported(provider: AiProvider | null): boolean {
  return provider !== null && PROVIDERS_WITH_MODEL_LISTING.includes(provider);
}

/**
 * Le listing des modèles est lançable : provider listable, clé disponible
 * (saisie ou déjà enregistrée), base_url si requise — la complétude du
 * formulaire SANS le modèle (c'est justement lui qu'on cherche).
 */
export function canListModels(v: AiCredentialsForm['value'], apiKeySet: boolean): boolean {
  const provider = v.provider ?? null;
  if (!modelListingSupported(provider)) {
    return false;
  }
  if (keyRequired(provider, apiKeySet) && !v.apiKey?.trim()) {
    return false;
  }
  if (baseUrlRequired(provider) && !v.baseUrl?.trim()) {
    return false;
  }
  return true;
}

/** Corps du `POST .../models` : `payloadFromForm` sans le champ `model`. */
export function modelListPayloadFromForm(form: AiCredentialsForm): AiModelListPayload {
  const { model: _model, ...payload } = payloadFromForm(form);
  return payload;
}
