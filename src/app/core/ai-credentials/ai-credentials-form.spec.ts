import {
  baseUrlRequired,
  baseUrlVisible,
  buildAiCredentialsForm,
  canListModels,
  isFormComplete,
  keyRequired,
  modelListingSupported,
  modelListPayloadFromForm,
  patchFormFromCredentials,
  payloadFromForm,
} from './ai-credentials-form';
import { AiCredentials } from './ai-credentials.model';

const STORED: AiCredentials = {
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  base_url: null,
  api_key_set: true,
  default_ai_available: false,
  daily_quota: 30,
  calls_today: 0,
};

describe('ai-credentials-form', () => {
  it('patchFormFromCredentials fills everything except the key (never read back)', () => {
    const form = buildAiCredentialsForm();
    form.controls.apiKey.setValue('résidu');
    patchFormFromCredentials(form, STORED);

    expect(form.controls.provider.value).toBe('anthropic');
    expect(form.controls.model.value).toBe('claude-sonnet-5');
    expect(form.controls.apiKey.value).toBe('');
  });

  it('payloadFromForm OMITS api_key when the field is empty (keep the stored key)', () => {
    const form = buildAiCredentialsForm();
    patchFormFromCredentials(form, STORED);
    form.controls.model.setValue('claude-opus-5');

    const payload = payloadFromForm(form);
    expect(payload).toEqual({ provider: 'anthropic', model: 'claude-opus-5', base_url: null });
    expect('api_key' in payload).toBe(false);
  });

  it('payloadFromForm carries the entered key and clears base_url outside ollama/openai_compatible', () => {
    const form = buildAiCredentialsForm();
    form.setValue({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      apiKey: '  sk-nouvelle  ',
      baseUrl: 'https://oubliee.example', // résidu d'un provider précédent
    });

    expect(payloadFromForm(form)).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
      api_key: 'sk-nouvelle',
    });
  });

  it('payloadFromForm keeps base_url for ollama', () => {
    const form = buildAiCredentialsForm();
    form.setValue({ provider: 'ollama', model: 'llama3.2', apiKey: '', baseUrl: 'http://pi:11434' });
    expect(payloadFromForm(form).base_url).toBe('http://pi:11434');
  });

  it('baseUrlVisible / baseUrlRequired follow the provider', () => {
    expect(baseUrlVisible('ollama')).toBe(true);
    expect(baseUrlVisible('openai_compatible')).toBe(true);
    expect(baseUrlVisible('anthropic')).toBe(false);
    expect(baseUrlVisible(null)).toBe(false);
    expect(baseUrlRequired('openai_compatible')).toBe(true);
    expect(baseUrlRequired('ollama')).toBe(false);
  });

  it('keyRequired: cloud provider without a stored key only', () => {
    expect(keyRequired('anthropic', false)).toBe(true);
    expect(keyRequired('anthropic', true)).toBe(false);
    expect(keyRequired('ollama', false)).toBe(false);
    expect(keyRequired(null, false)).toBe(false);
  });

  it('isFormComplete applies the per-provider rules', () => {
    const form = buildAiCredentialsForm();
    expect(isFormComplete(form.value, false)).toBe(false);

    form.setValue({ provider: 'anthropic', model: 'm', apiKey: '', baseUrl: '' });
    expect(isFormComplete(form.value, false)).toBe(false); // clé requise
    expect(isFormComplete(form.value, true)).toBe(true); // clé déjà enregistrée

    form.controls.apiKey.setValue('sk-x');
    expect(isFormComplete(form.value, false)).toBe(true);

    form.setValue({ provider: 'openai_compatible', model: 'm', apiKey: '', baseUrl: '' });
    expect(isFormComplete(form.value, false)).toBe(false); // base_url requise
    form.controls.baseUrl.setValue('https://groq.example/v1');
    expect(isFormComplete(form.value, false)).toBe(true); // clé optionnelle ici
  });

  it('modelListingSupported: every provider except huggingface (and none)', () => {
    expect(modelListingSupported('anthropic')).toBe(true);
    expect(modelListingSupported('ollama')).toBe(true);
    expect(modelListingSupported('huggingface')).toBe(false);
    expect(modelListingSupported(null)).toBe(false);
  });

  it('canListModels: same rules as completeness, WITHOUT the model field', () => {
    const form = buildAiCredentialsForm();
    expect(canListModels(form.value, false)).toBe(false); // pas de provider

    form.setValue({ provider: 'anthropic', model: '', apiKey: '', baseUrl: '' });
    expect(canListModels(form.value, false)).toBe(false); // clé requise
    expect(canListModels(form.value, true)).toBe(true); // clé déjà enregistrée
    form.controls.apiKey.setValue('sk-x');
    expect(canListModels(form.value, false)).toBe(true); // le modèle vide n'empêche rien

    form.setValue({ provider: 'openai_compatible', model: '', apiKey: '', baseUrl: '' });
    expect(canListModels(form.value, false)).toBe(false); // base_url requise
    form.controls.baseUrl.setValue('https://groq.example/v1');
    expect(canListModels(form.value, false)).toBe(true);

    form.setValue({ provider: 'huggingface', model: '', apiKey: 'hf-x', baseUrl: '' });
    expect(canListModels(form.value, false)).toBe(false); // pas de listing chez hf
  });

  it('modelListPayloadFromForm drops the model, keeps the key semantics', () => {
    const form = buildAiCredentialsForm();
    patchFormFromCredentials(form, STORED);
    form.controls.model.setValue('résidu-ignoré');

    const payload = modelListPayloadFromForm(form);
    expect(payload).toEqual({ provider: 'anthropic', base_url: null });
    expect('api_key' in payload).toBe(false); // champ vide = clé enregistrée

    form.controls.apiKey.setValue('sk-saisie');
    expect(modelListPayloadFromForm(form).api_key).toBe('sk-saisie');
  });
});
