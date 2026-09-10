import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import {
  AiConfiguration,
  AiCredentials,
  EMPTY_AI_CREDENTIALS,
  EMPTY_REASONING_OPTIONS,
} from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { ProposalModeService } from '../../../core/course-assistant/proposal-mode.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { mockAssistantChatState } from '../../../testing/assistant.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CourseChatSettings } from './course-chat-settings';

const CLAUDE_ID = '11111111-1111-4111-8111-111111111111';
const OLLAMA_ID = '22222222-2222-4222-8222-222222222222';

/** Configuration Anthropic (bascule + niveaux natifs du catalogue), sans préférence posée. */
const CLAUDE: AiConfiguration = {
  id: CLAUDE_ID,
  name: 'Claude',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  base_url: null,
  api_key_set: true,
  reasoning: null,
  reasoning_effort: null,
  reasoning_options: { toggle: ['on', 'off'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], known: true },
};

const OLLAMA: AiConfiguration = {
  id: OLLAMA_ID,
  name: 'Pi',
  provider: 'ollama',
  model: 'llama3.2',
  base_url: 'http://pi:11434',
  api_key_set: false,
  reasoning: null,
  reasoning_effort: null,
  reasoning_options: EMPTY_REASONING_OPTIONS,
};

/** IA par défaut du serveur : jamais de préférence de raisonnement. */
const DEFAULT_AI: AiCredentials = {
  ...EMPTY_AI_CREDENTIALS,
  default_ai_available: true,
  daily_quota: 30,
  calls_today: 3,
  default_provider: 'anthropic',
  default_model: 'claude-sonnet-5',
};

/** Claude active, Ollama en réserve. */
const CUSTOM: AiCredentials = {
  ...DEFAULT_AI,
  configurations: [CLAUDE, OLLAMA],
  active_id: CLAUDE_ID,
};

/** `CUSTOM` dont la configuration active est remplacée. */
function withActive(config: AiConfiguration): AiCredentials {
  return { ...CUSTOM, configurations: [config, OLLAMA], active_id: config.id };
}

describe('CourseChatSettings', () => {
  let credentials: ReturnType<typeof signal<AiCredentials | null>>;
  let service: {
    credentials: ReturnType<typeof signal<AiCredentials | null>>;
    ensureLoaded: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    listModels: ReturnType<typeof vi.fn>;
    reasoningOptions: ReturnType<typeof vi.fn>;
  };
  let notifications: { error: ReturnType<typeof vi.fn> };

  async function setup(initial: AiCredentials): Promise<ComponentFixture<CourseChatSettings>> {
    credentials = signal<AiCredentials | null>(initial);
    service = {
      credentials,
      ensureLoaded: vi.fn().mockResolvedValue(initial),
      refresh: vi.fn().mockResolvedValue(initial),
      update: vi.fn().mockResolvedValue(initial),
      activate: vi.fn().mockResolvedValue(initial),
      listModels: vi.fn().mockResolvedValue(['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-5']),
      reasoningOptions: vi.fn().mockResolvedValue(CLAUDE.reasoning_options),
    };
    notifications = { error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [CourseChatSettings, provideTranslocoTesting()],
      providers: [
        { provide: AiCredentialsService, useValue: service },
        { provide: NotificationService, useValue: notifications },
        { provide: LanguageService, useValue: { lang: () => 'fr' } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseChatSettings);
    fixture.componentRef.setInput('assistant', mockAssistantChatState());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<CourseChatSettings>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function selects(fixture: ComponentFixture<CourseChatSettings>): HTMLSelectElement[] {
    return Array.from(el(fixture).querySelectorAll('.chat-settings__select'));
  }

  function change(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  function openMenu(fixture: ComponentFixture<CourseChatSettings>): HTMLButtonElement[] {
    el(fixture).querySelector<HTMLButtonElement>('.chat-settings__gear')!.click();
    fixture.detectChanges();
    return Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.chat-settings__menu-item'));
  }

  describe('model label', () => {
    it('shows the active configuration name and model, no quota', async () => {
      const fixture = await setup(CUSTOM);
      const label = el(fixture).querySelector('.model-picker__trigger')!;
      expect(label.textContent!.replace(/\s+/g, ' ').trim()).toBe('Claude · claude-sonnet-5');
      expect(el(fixture).querySelector('.chat-settings__quota')).toBeNull();
    });

    it('shows the default AI with its quota when nothing is active', async () => {
      const fixture = await setup(DEFAULT_AI);
      expect(el(fixture).querySelector('.chat-settings__model')!.textContent).toContain(
        'IA par défaut : claude-sonnet-5',
      );
      expect(el(fixture).querySelector('.chat-settings__quota')!.textContent).toContain('3/30');
    });
  });

  describe('auto-edit switch', () => {
    afterEach(() => localStorage.removeItem('oc-assistant-proposal-mode'));

    function autoEdit(fixture: ComponentFixture<CourseChatSettings>): HTMLButtonElement | null {
      return el(fixture).querySelector<HTMLButtonElement>('.chat-settings__auto-edit');
    }

    it('is absent outside editing chats (global panel)', async () => {
      const fixture = await setup(CUSTOM);
      expect(autoEdit(fixture)).toBeNull();
    });

    it('editing chats: an off switch that toggles the shared proposal mode', async () => {
      const fixture = await setup(CUSTOM);
      fixture.componentRef.setInput('editing', true);
      fixture.detectChanges();

      const toggle = autoEdit(fixture)!;
      expect(toggle.getAttribute('role')).toBe('switch');
      expect(toggle.textContent!.trim()).toBe('Édition auto');
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(toggle.title).toContain('attend votre validation');

      toggle.click();
      fixture.detectChanges();
      expect(TestBed.inject(ProposalModeService).mode()).toBe('auto');
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(toggle.title).toContain('sauf suppression de question');

      toggle.click();
      fixture.detectChanges();
      expect(TestBed.inject(ProposalModeService).mode()).toBe('ask');
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('quick switch menu', () => {
    it('lists the default AI and each configuration as radio items, the active one checked', async () => {
      const fixture = await setup(CUSTOM);
      const items = openMenu(fixture);
      expect(items.map((i) => i.textContent!.trim())).toEqual([
        'IA par défaut',
        'Claude',
        'Pi',
        'Gérer les configurations…',
      ]);
      expect(items.slice(0, 3).map((i) => i.getAttribute('role'))).toEqual([
        'menuitemradio',
        'menuitemradio',
        'menuitemradio',
      ]);
      expect(items.slice(0, 3).map((i) => i.getAttribute('aria-checked'))).toEqual([
        'false',
        'true',
        'false',
      ]);
      expect(items[3].getAttribute('role')).toBe('menuitem');
    });

    it('clicking a configuration activates it and closes the menu; the default AI passes null', async () => {
      const fixture = await setup(CUSTOM);
      openMenu(fixture)[2].click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(service.activate).toHaveBeenCalledWith(OLLAMA_ID);
      expect(el(fixture).querySelector('.chat-settings__menu')).toBeNull();

      openMenu(fixture)[0].click();
      await fixture.whenStable();
      expect(service.activate).toHaveBeenLastCalledWith(null);

      // L'entrée déjà active ne déclenche rien.
      openMenu(fixture)[1].click();
      await fixture.whenStable();
      expect(service.activate).toHaveBeenCalledTimes(2);
    });

    it('disables the default AI item when the server offers none', async () => {
      const fixture = await setup({ ...CUSTOM, default_ai_available: false });
      expect(openMenu(fixture)[0].disabled).toBe(true);
    });

    it('a failed switch shows a toast', async () => {
      const fixture = await setup(CUSTOM);
      service.activate.mockRejectedValue(new Error('500'));
      openMenu(fixture)[2].click();
      await fixture.whenStable();
      expect(notifications.error).toHaveBeenCalledWith(
        'Changement de configuration non enregistré — réessayez.',
      );
    });
  });

  describe('model picker', () => {
    function trigger(fixture: ComponentFixture<CourseChatSettings>): HTMLButtonElement {
      return el(fixture).querySelector<HTMLButtonElement>('.model-picker__trigger')!;
    }

    async function openPicker(fixture: ComponentFixture<CourseChatSettings>): Promise<HTMLInputElement> {
      trigger(fixture).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return el(fixture).querySelector<HTMLInputElement>('.model-picker__input')!;
    }

    function optionTexts(fixture: ComponentFixture<CourseChatSettings>): string[] {
      return Array.from(el(fixture).querySelectorAll('[role="option"]'), (o) =>
        o.textContent!.trim(),
      );
    }

    function type(input: HTMLInputElement, value: string): void {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('is absent for the default AI', async () => {
      const fixture = await setup(DEFAULT_AI);
      expect(trigger(fixture)).toBeNull();
    });

    it('opens on the label, lists the provider models with the stored key, filters, picks and saves', async () => {
      const fixture = await setup(CUSTOM);
      expect(el(fixture).querySelector('.model-picker__popover')).toBeNull();

      const input = await openPicker(fixture);
      expect(trigger(fixture).getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(input);
      expect(input.placeholder).toBe('claude-sonnet-5');
      // Clé enregistrée de la configuration active : config_id, jamais la clé.
      expect(service.listModels).toHaveBeenCalledWith({
        provider: 'anthropic',
        base_url: null,
        config_id: CLAUDE_ID,
      });
      expect(optionTexts(fixture)).toEqual(['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-5']);

      type(input, 'opus-4');
      fixture.detectChanges();
      expect(optionTexts(fixture)).toEqual(['claude-opus-4-5']);

      (el(fixture).querySelector('[role="option"]') as HTMLElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el(fixture).querySelector('.model-picker__popover')).toBeNull();
      expect(service.update).toHaveBeenCalledWith(CLAUDE_ID, {
        provider: 'anthropic',
        model: 'claude-opus-4-5',
        base_url: null,
        reasoning: null,
        reasoning_effort: null,
        name: 'Claude',
      });
      expect('api_key' in service.update.mock.calls[0][1]).toBe(false);
    });

    it('aligns the reasoning preferences with the options of the new model', async () => {
      const fixture = await setup(withActive({ ...CLAUDE, reasoning: true, reasoning_effort: 'max' }));
      service.reasoningOptions.mockResolvedValue({
        toggle: ['on', 'off'],
        efforts: ['low', 'medium', 'high'],
        known: true,
      });
      const input = await openPicker(fixture);

      type(input, 'claude-opus-4-5');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();

      expect(service.reasoningOptions).toHaveBeenCalledWith({
        provider: 'anthropic',
        model: 'claude-opus-4-5',
      });
      expect(service.update).toHaveBeenCalledWith(
        CLAUDE_ID,
        expect.objectContaining({ model: 'claude-opus-4-5', reasoning: true, reasoning_effort: null }),
      );
    });

    it('keyboard: ArrowDown highlights, Enter picks the highlighted suggestion', async () => {
      const fixture = await setup(CUSTOM);
      const input = await openPicker(fixture);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      fixture.detectChanges();
      const active = el(fixture).querySelector('[aria-selected="true"]') as HTMLElement;
      expect(active.textContent!.trim()).toBe('claude-opus-5');
      expect(input.getAttribute('aria-activedescendant')).toBe(active.id);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(service.update).toHaveBeenCalledWith(
        CLAUDE_ID,
        expect.objectContaining({ model: 'claude-opus-5' }),
      );
    });

    it('Enter on the current model or on an empty field saves nothing; Escape closes and refocuses', async () => {
      const fixture = await setup(CUSTOM);
      const input = await openPicker(fixture);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      type(input, 'claude-sonnet-5');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(service.update).not.toHaveBeenCalled();

      await openPicker(fixture);
      el(fixture)
        .querySelector('app-course-chat-model-picker')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(el(fixture).querySelector('.model-picker__popover')).toBeNull();
      expect(document.activeElement).toBe(trigger(fixture));
    });

    it('listing failure keeps free typing (Enter applies the typed model), probed once', async () => {
      const fixture = await setup(CUSTOM);
      service.listModels.mockRejectedValue(new Error('400'));
      const input = await openPicker(fixture);
      expect(el(fixture).textContent).toContain('Modèles indisponibles');

      type(input, 'claude-opus-5');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(service.update).toHaveBeenCalledWith(
        CLAUDE_ID,
        expect.objectContaining({ model: 'claude-opus-5' }),
      );

      await openPicker(fixture);
      expect(service.listModels).toHaveBeenCalledTimes(1);
    });

    it('offers free typing only for a provider without model listing (huggingface)', async () => {
      const hf = { ...CLAUDE, provider: 'huggingface' as const, model: 'Qwen/Qwen3-8B' };
      const fixture = await setup(withActive(hf));
      const input = await openPicker(fixture);
      expect(service.listModels).not.toHaveBeenCalled();
      expect(el(fixture).querySelector('[role="listbox"]')).toBeNull();
      expect(el(fixture).textContent).toContain('Saisissez le nom du modèle');

      type(input, 'Qwen/Qwen3-32B');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(service.update).toHaveBeenCalledWith(
        CLAUDE_ID,
        expect.objectContaining({ provider: 'huggingface', model: 'Qwen/Qwen3-32B' }),
      );
    });

    it('a failed save shows a toast', async () => {
      const fixture = await setup(CUSTOM);
      service.update.mockRejectedValue(new Error('500'));
      const input = await openPicker(fixture);
      type(input, 'claude-opus-5');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(notifications.error).toHaveBeenCalledWith(
        'Changement de modèle non enregistré — réessayez.',
      );
    });

    it('switching the active configuration closes the picker and re-probes the new provider', async () => {
      const fixture = await setup(CUSTOM);
      await openPicker(fixture);
      credentials.set({ ...CUSTOM, active_id: OLLAMA_ID });
      fixture.detectChanges();
      expect(el(fixture).querySelector('.model-picker__popover')).toBeNull();

      await openPicker(fixture);
      expect(service.listModels).toHaveBeenLastCalledWith({
        provider: 'ollama',
        base_url: 'http://pi:11434',
        config_id: OLLAMA_ID,
      });
    });
  });

  describe('reasoning preferences', () => {
    it('shows nothing for the default AI nor for a provider without reasoning capability', async () => {
      expect(selects(await setup(DEFAULT_AI))).toHaveLength(0);
      TestBed.resetTestingModule();
      const mistral = { ...CLAUDE, provider: 'mistral' as const, reasoning_options: EMPTY_REASONING_OPTIONS };
      expect(selects(await setup(withActive(mistral)))).toHaveLength(0);
    });

    it('offers the selectors and options of the catalogue: both for claude-sonnet-5, effort alone for gpt-5', async () => {
      const both = selects(await setup(CUSTOM));
      expect(both).toHaveLength(2);
      expect(both[0].getAttribute('aria-label')).toBe('Raisonnement du modèle');
      expect(both[1].getAttribute('aria-label')).toBe('Effort de raisonnement');
      expect(Array.from(both[1].options, (o) => o.value)).toEqual([
        '',
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
      ]);
      expect(both[1].options[4].textContent!.trim()).toBe('Effort · très élevé');

      TestBed.resetTestingModule();
      const gpt5 = {
        ...CLAUDE,
        provider: 'openai' as const,
        model: 'gpt-5',
        reasoning_options: {
          toggle: [],
          efforts: ['minimal', 'low', 'medium', 'high'],
          known: true,
        },
      };
      const effortOnly = selects(await setup(withActive(gpt5)));
      expect(effortOnly).toHaveLength(1);
      expect(effortOnly[0].getAttribute('aria-label')).toBe('Effort de raisonnement');
      expect(effortOnly[0].options[1].value).toBe('minimal');
    });

    it('hides the “off” option when the model cannot be switched off (Gemini 3)', async () => {
      const gemini3 = {
        ...CLAUDE,
        provider: 'google' as const,
        model: 'gemini-3-pro-preview',
        reasoning_options: { toggle: ['on' as const], efforts: ['low', 'high'], known: true },
      };
      const [reasoning, effort] = selects(await setup(withActive(gemini3)));
      expect(Array.from(reasoning.options, (o) => o.value)).toEqual(['', 'on']);
      expect(Array.from(effort.options, (o) => o.value)).toEqual(['', 'low', 'high']);
    });

    it('reflects the stored preferences in the selected options', async () => {
      const [reasoning, effort] = selects(
        await setup(withActive({ ...CLAUDE, reasoning: false, reasoning_effort: 'high' })),
      );
      expect(reasoning.value).toBe('off');
      expect(effort.value).toBe('high');
    });

    it('a change updates the ACTIVE configuration (key omitted) and freezes the selectors meanwhile', async () => {
      const fixture = await setup(CUSTOM);
      let resolveUpdate!: (creds: AiCredentials) => void;
      service.update.mockImplementation(
        () => new Promise<AiCredentials>((resolve) => (resolveUpdate = resolve)),
      );

      const [reasoning, effort] = selects(fixture);
      change(reasoning, 'on');
      fixture.detectChanges();

      expect(service.update).toHaveBeenCalledWith(CLAUDE_ID, {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        base_url: null,
        reasoning: true,
        reasoning_effort: null,
        name: 'Claude',
      });
      expect('api_key' in service.update.mock.calls[0][1]).toBe(false);
      expect(reasoning.disabled).toBe(true);
      expect(effort.disabled).toBe(true);

      // Le vrai service écrit la réponse dans le signal avant de résoudre.
      const saved = withActive({ ...CLAUDE, reasoning: true });
      credentials.set(saved);
      resolveUpdate(saved);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(reasoning.disabled).toBe(false);
      expect(reasoning.value).toBe('on');

      change(effort, 'high');
      expect(service.update).toHaveBeenLastCalledWith(
        CLAUDE_ID,
        expect.objectContaining({ reasoning: true, reasoning_effort: 'high' }),
      );
    });

    it('a failed update reverts the selector to the stored value and shows a toast', async () => {
      const fixture = await setup(withActive({ ...CLAUDE, reasoning_effort: 'low' }));
      service.update.mockRejectedValue(new Error('500'));

      const [, effort] = selects(fixture);
      change(effort, 'high');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(effort.value).toBe('low');
      expect(effort.disabled).toBe(false);
      expect(notifications.error).toHaveBeenCalledWith(
        'Réglage de raisonnement non enregistré — réessayez.',
      );
    });
  });
});
