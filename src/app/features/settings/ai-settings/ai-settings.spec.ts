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
  api_key_definie: true,
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

  it('pré-remplit provider/modèle, jamais la clé', async () => {
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

  it('clé enregistrée + champ vide : le payload du save OMET api_key', async () => {
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

  it('clé saisie : le payload la porte, puis le champ est vidé après save', async () => {
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

  it('affiche base_url pour ollama seulement', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="url"]')).toBeNull();

    fixture.componentInstance.form.controls.provider.setValue('ollama');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="url"]')).toBeTruthy();
  });

  it('supprime en deux temps (armé puis confirmé)', async () => {
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

  it('sans configuration : pas de bouton supprimer, save inactif tant qu’incomplet', async () => {
    const fixture = setup({ provider: null, model: null, base_url: null, api_key_definie: false });
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
});
