import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AiCredentials } from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { AiSettings } from './ai-settings';

const STORED: AiCredentials = {
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  base_url: null,
  api_key_set: true,
  default_ai_available: true,
  daily_quota: 30,
  calls_today: 12,
};

const NO_CONFIG: AiCredentials = {
  provider: null,
  model: null,
  base_url: null,
  api_key_set: false,
  default_ai_available: true,
  daily_quota: 30,
  calls_today: 12,
};

describe('AiSettings', () => {
  let credentials: ReturnType<typeof signal<AiCredentials | null>>;
  let service: {
    credentials: ReturnType<typeof signal<AiCredentials | null>>;
    ensureLoaded: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    testConnection: ReturnType<typeof vi.fn>;
    listModels: ReturnType<typeof vi.fn>;
  };

  function setup(initial: AiCredentials) {
    credentials = signal<AiCredentials | null>(initial);
    service = {
      credentials,
      ensureLoaded: vi.fn().mockResolvedValue(initial),
      save: vi.fn().mockResolvedValue(initial),
      remove: vi.fn().mockResolvedValue(undefined),
      testConnection: vi.fn().mockResolvedValue(undefined),
      listModels: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({
      imports: [AiSettings, provideTranslocoTesting()],
      providers: [{ provide: AiCredentialsService, useValue: service }],
    });
    const fixture = TestBed.createComponent(AiSettings);
    return fixture;
  }

  it('prefills provider/model, never the key', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.form.controls.provider.value).toBe('anthropic');
    expect(component.form.controls.model.value).toBe('claude-sonnet-5');
    expect(component.form.controls.apiKey.value).toBe('');
    const keyInput = fixture.nativeElement.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    expect(keyInput.value).toBe('');
  });

  it('stored key + empty field: the save payload OMITS api_key', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.form.controls.model.setValue('claude-opus-5');
    await fixture.whenStable();
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '.btn--primary',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    await fixture.whenStable();

    expect(service.save).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-opus-5',
      base_url: null,
    });
  });

  it('key typed: the payload carries it, then the field is cleared after save', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.form.controls.apiKey.setValue('sk-nouvelle');
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.btn--primary') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ api_key: 'sk-nouvelle' }),
    );
    expect(component.form.controls.apiKey.value).toBe('');
  });

  it('shows base_url for ollama only', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="url"]')).toBeNull();

    fixture.componentInstance.form.controls.provider.setValue('ollama');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="url"]')).toBeTruthy();
  });

  it('deletes in two steps (armed then confirmed)', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();

    const deleteButton = fixture.nativeElement.querySelector(
      '.ai-settings__delete',
    ) as HTMLButtonElement;
    deleteButton.click();
    await fixture.whenStable();
    expect(service.remove).not.toHaveBeenCalled();

    deleteButton.click();
    await fixture.whenStable();
    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.form.controls.provider.value).toBeNull();
  });

  it('without a configuration: no delete button, save inactive while incomplete', async () => {
    const fixture = setup(NO_CONFIG);
    await fixture.whenStable();
    fixture.detectChanges();

    // Sans config, le mode IA par défaut est présélectionné : on bascule
    // délibérément sur « ma propre clé » pour atteindre le formulaire.
    (
      fixture.nativeElement.querySelector('input[value="custom"]') as HTMLInputElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ai-settings__delete')).toBeNull();
    const saveButton = fixture.nativeElement.querySelector(
      '.btn--primary',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const component = fixture.componentInstance;
    component.form.controls.provider.setValue('anthropic');
    component.form.controls.model.setValue('claude-sonnet-5');
    component.form.controls.apiKey.setValue('sk-x');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton.disabled).toBe(false);
  });

  it('without a configuration: the default AI mode is preselected with the quota usage', async () => {
    const fixture = setup(NO_CONFIG);
    await fixture.whenStable();
    fixture.detectChanges();

    const defaultRadio = fixture.nativeElement.querySelector(
      'input[value="default"]',
    ) as HTMLInputElement;
    expect(defaultRadio.checked).toBe(true);
    // Le formulaire n'est pas rendu en mode défaut.
    expect(fixture.nativeElement.querySelector('.ai-settings__form')).toBeNull();
    // Compteur « utilisés / autorisés » du jour sur la carte du mode.
    const hint = fixture.nativeElement.querySelector(
      '.ai-settings__mode-hint',
    ) as HTMLElement;
    expect(hint.textContent).toContain('12 / 30');
  });

  it('quota 0: unlimited messages, never “0 / 0”', async () => {
    const fixture = setup({ ...NO_CONFIG, daily_quota: 0, calls_today: 4 });
    await fixture.whenStable();
    fixture.detectChanges();

    const hint = fixture.nativeElement.querySelector(
      '.ai-settings__mode-hint',
    ) as HTMLElement;
    expect(hint.textContent).not.toContain('/');
  });

  it('test connection sends the PUT-shaped payload (empty key field = stored key)', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();

    const testButton = fixture.nativeElement.querySelector(
      '.ai-settings__test',
    ) as HTMLButtonElement;
    expect(testButton.disabled).toBe(false);
    testButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.testConnection).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
    });
    expect(fixture.nativeElement.textContent).toContain('Connexion réussie');
  });

  it('test connection failure maps the status to a probe error message', async () => {
    const fixture = setup(STORED);
    service.testConnection.mockRejectedValue(new HttpErrorResponse({ status: 400 }));
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.ai-settings__test') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Clé API refusée');
    // Corriger le formulaire efface le verdict périmé.
    fixture.componentInstance.form.controls.apiKey.setValue('sk-corrigée');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Clé API refusée');
  });

  it('model combobox: no probe without a key, then suggestions load on focus and filter', async () => {
    const fixture = setup(NO_CONFIG);
    service.listModels.mockResolvedValue(['claude-sonnet-5', 'claude-opus-5']);
    await fixture.whenStable();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('input[value="custom"]') as HTMLInputElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.controls.provider.setValue('anthropic');
    await fixture.whenStable();
    fixture.detectChanges();

    const modelInput = fixture.nativeElement.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    // Clé requise et aucune enregistrée : pas de sonde, pas de listbox, hint affiché.
    expect(service.listModels).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('suggestions de modèles');

    component.form.controls.apiKey.setValue('sk-x');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.listModels).toHaveBeenCalledWith({
      provider: 'anthropic',
      api_key: 'sk-x',
      base_url: null,
    });
    const optionTexts = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll('[role="option"]'),
        (o) => (o as HTMLElement).textContent!.trim(),
      );
    expect(optionTexts()).toEqual(['claude-sonnet-5', 'claude-opus-5']);

    // La saisie filtre les suggestions.
    component.form.controls.model.setValue('opus');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(optionTexts()).toEqual(['claude-opus-5']);

    // Le clic sur une option remplit le champ et referme la listbox.
    (fixture.nativeElement.querySelector('[role="option"]') as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.form.controls.model.value).toBe('claude-opus-5');
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();

    // Changer de provider purge : le prochain focus re-sonde.
    component.form.controls.provider.setValue('mistral');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.listModels).toHaveBeenCalledTimes(2);
  });

  it('model combobox keyboard: ArrowDown highlights, Enter picks', async () => {
    const fixture = setup(STORED);
    service.listModels.mockResolvedValue(['claude-sonnet-5', 'claude-opus-5']);
    await fixture.whenStable();
    fixture.detectChanges();

    const modelInput = fixture.nativeElement.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    fixture.componentInstance.form.controls.model.setValue('');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();

    modelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await fixture.whenStable();
    fixture.detectChanges();
    const active = fixture.nativeElement.querySelector('[aria-selected="true"]') as HTMLElement;
    expect(active.textContent!.trim()).toBe('claude-sonnet-5');
    expect(modelInput.getAttribute('aria-activedescendant')).toBe(active.id);

    modelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.model.value).toBe('claude-sonnet-5');
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });

  it('model combobox: probe failure shows the error once, retried after fixing the key', async () => {
    const fixture = setup(STORED);
    service.listModels.mockRejectedValue(new HttpErrorResponse({ status: 400 }));
    await fixture.whenStable();
    fixture.detectChanges();

    const modelInput = fixture.nativeElement.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Clé API refusée');
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();

    // Refocus sans rien corriger : pas de nouvelle sonde en boucle.
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    expect(service.listModels).toHaveBeenCalledTimes(1);

    // Corriger la clé efface l'erreur et rouvre la porte à une sonde.
    service.listModels.mockResolvedValue(['gpt-4o']);
    fixture.componentInstance.form.controls.apiKey.setValue('sk-corrigée');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.listModels).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).not.toContain('Clé API refusée');
  });

  it('model combobox is not offered for huggingface', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();
    const modelInput = fixture.nativeElement.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    expect(modelInput.getAttribute('role')).toBe('combobox');

    fixture.componentInstance.form.controls.provider.setValue('huggingface');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(modelInput.getAttribute('role')).toBeNull();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    expect(service.listModels).not.toHaveBeenCalled();
  });

  it('stored config: “use the default AI” deletes in two steps', async () => {
    const fixture = setup(STORED);
    // Le vrai service relit le serveur après le DELETE : le mock fait pareil.
    service.remove.mockImplementation(async () => credentials.set(NO_CONFIG));
    await fixture.whenStable();
    fixture.detectChanges();

    // Mode « ma clé » présélectionné ; bascule délibérée sur l'IA par défaut.
    (
      fixture.nativeElement.querySelector('input[value="default"]') as HTMLInputElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ai-settings__form')).toBeNull();

    const useDefault = fixture.nativeElement.querySelector(
      '.ai-settings__use-default',
    ) as HTMLButtonElement;
    useDefault.click();
    await fixture.whenStable();
    expect(service.remove).not.toHaveBeenCalled();

    useDefault.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.remove).toHaveBeenCalledTimes(1);
    // La config est partie : le bouton disparaît, le mode défaut reste affiché.
    expect(fixture.nativeElement.querySelector('.ai-settings__use-default')).toBeNull();
  });
});
