import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
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
  };

  function setup(initial: AiCredentials) {
    credentials = signal<AiCredentials | null>(initial);
    service = {
      credentials,
      ensureLoaded: vi.fn().mockResolvedValue(initial),
      save: vi.fn().mockResolvedValue(initial),
      remove: vi.fn().mockResolvedValue(undefined),
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
