import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { AssistantPendingProposal } from '../../../core/course-assistant/proposals';
import { ModuleDetail } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';
import { ModuleRunner } from '../../../shared/module-runner/module-runner';
import {
  mockAiCredentialsService,
  mockAssistantChatState,
} from '../../../testing/assistant.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { ModuleEditor } from './module-editor';

const DETAIL: ModuleDetail = {
  id: 'module-1',
  title: 'Quiz interactif',
  html: '<p>Salut</p>',
  css: 'p { color: red; }',
  js: "console.log('ok')",
  created_at: '2026-07-01',
  updated_at: '2026-07-01',
};

/**
 * Monaco est inerte en jsdom (loader AMD non chargé) : les specs pilotent les
 * trois FormControl publics. Les tests d'autosave et de preview utilisent les
 * fake timers de vitest (debounce 1500 ms / 500 ms).
 */
describe('ModuleEditor', () => {
  const modulesMock = {
    getModule: vi.fn(),
    updateModule: vi.fn(),
  };
  let assistantState: ReturnType<typeof mockAssistantChatState>;

  async function configure(): Promise<void> {
    assistantState = mockAssistantChatState();
    TestBed.configureTestingModule({
      imports: [ModuleEditor, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: ModuleService, useValue: modulesMock },
        // Le chat ancré est en mode edit (contexte `module`) : son bandeau
        // réglages injecte AiCredentialsService.
        { provide: AiCredentialsService, useValue: mockAiCredentialsService() },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'course-1', moduleId: 'module-1' }) },
          },
        },
      ],
    });
    // Remplace le `providers: [AssistantChatState]` du composant par le mock
    // (sinon la vraie classe s'instancie : chaîne AuthService → OAuthService).
    TestBed.overrideComponent(ModuleEditor, {
      set: { providers: [{ provide: AssistantChatState, useValue: assistantState }] },
    });
    await TestBed.compileComponents();
  }

  /** Création synchrone (fake timers actifs) : microtasks flushées à la main. */
  async function createComponent(): Promise<ComponentFixture<ModuleEditor>> {
    const fixture = TestBed.createComponent(ModuleEditor);
    fixture.detectChanges();
    TestBed.tick();
    // Laisse la promesse de getModule initialiser les contrôles.
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<ModuleEditor>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    modulesMock.getModule.mockResolvedValue(DETAIL);
    modulesMock.updateModule.mockResolvedValue(DETAIL);
    await configure();
  });

  it('loads the module and initializes the three controls only once', async () => {
    const fixture = await createComponent();
    expect(modulesMock.getModule).toHaveBeenCalledWith('course-1', 'module-1');
    expect(fixture.componentInstance.htmlControl.value).toBe(DETAIL.html);
    expect(fixture.componentInstance.cssControl.value).toBe(DETAIL.css);
    expect(fixture.componentInstance.jsControl.value).toBe(DETAIL.js);
    expect(el(fixture).textContent).toContain('Quiz interactif');
  });

  it('three HTML/CSS/JS tabs: switched via [hidden], panels never destroyed', async () => {
    const fixture = await createComponent();
    const panels = () => Array.from(el(fixture).querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    // Les trois panneaux existent dès le départ (Monaco vit dans les trois).
    expect(panels().length).toBe(3);
    expect(panels().map((p) => p.hidden)).toEqual([false, true, true]);

    const tabs = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs[2].click();
    fixture.detectChanges();
    expect(panels().length).toBe(3); // toujours montés
    expect(panels().map((p) => p.hidden)).toEqual([true, true, false]);
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
  });

  it('the preview receives the loaded code then follows typing (500 ms debounce)', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await createComponent();
      const runner = fixture.debugElement.query(By.directive(ModuleRunner))
        .componentInstance as ModuleRunner;
      // À l'ouverture : la preview reflète le code SAUVEGARDÉ (seed direct au
      // chargement — les setValue d'init n'émettent pas sur valueChanges).
      expect(runner.html()).toBe(DETAIL.html);
      expect(runner.css()).toBe(DETAIL.css);
      expect(runner.js()).toBe(DETAIL.js);

      fixture.componentInstance.htmlControl.setValue('<p>V2</p>');
      // Pas encore : debounce en cours, la preview garde le code chargé.
      expect(runner.html()).toBe(DETAIL.html);
      vi.advanceTimersByTime(500);
      fixture.detectChanges();
      expect(runner.html()).toBe('<p>V2</p>');
      // Les volets jamais retouchés restent fidèles au code sauvegardé.
      expect(runner.css()).toBe(DETAIL.css);
      expect(runner.js()).toBe(DETAIL.js);
    } finally {
      vi.useRealTimers();
    }
  });

  it('autosave: keystroke → dirty → PATCH of the full code after 1500 ms → saved', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await createComponent();
      fixture.componentInstance.htmlControl.setValue('<p>V2</p>');
      expect(el(fixture).textContent).not.toContain('Enregistré');

      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();

      expect(modulesMock.updateModule).toHaveBeenCalledWith('course-1', 'module-1', {
        html: '<p>V2</p>',
        css: DETAIL.css,
        js: DETAIL.js,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('no PATCH when the code returns to the persisted state', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await createComponent();
      fixture.componentInstance.htmlControl.setValue('<p>V2</p>');
      fixture.componentInstance.htmlControl.setValue(DETAIL.html);
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      expect(modulesMock.updateModule).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes on ngOnDestroy when a keystroke was not persisted', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await createComponent();
      fixture.componentInstance.htmlControl.setValue('<p>V2</p>');
      fixture.destroy();
      // Le flush s'enchaîne derrière l'éventuel PATCH en vol (ici aucun) :
      // une microtâche plus tard, jamais synchrone.
      await Promise.resolve();
      await Promise.resolve();
      expect(modulesMock.updateModule).toHaveBeenCalledWith('course-1', 'module-1', {
        html: '<p>V2</p>',
        css: DETAIL.css,
        js: DETAIL.js,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('the destroy flush awaits the in-flight PATCH (old code never overwrites new)', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await createComponent();
      let resolveInFlight!: (value: ModuleDetail) => void;
      modulesMock.updateModule.mockImplementationOnce(
        () =>
          new Promise<ModuleDetail>((resolve) => {
            resolveInFlight = resolve;
          }),
      );
      // PATCH A part (autosave) et reste en vol.
      fixture.componentInstance.htmlControl.setValue('<p>V2</p>');
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      expect(modulesMock.updateModule).toHaveBeenCalledTimes(1);

      // Frappe plus récente puis sortie : le flush B ne doit pas doubler A.
      fixture.componentInstance.htmlControl.setValue('<p>V3</p>');
      fixture.destroy();
      await Promise.resolve();
      await Promise.resolve();
      expect(modulesMock.updateModule).toHaveBeenCalledTimes(1); // toujours en attente

      resolveInFlight(DETAIL);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(modulesMock.updateModule).toHaveBeenCalledTimes(2);
      expect(modulesMock.updateModule).toHaveBeenLastCalledWith('course-1', 'module-1', {
        html: '<p>V3</p>',
        css: DETAIL.css,
        js: DETAIL.js,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('assistant: visible by default, collapsed by the toggle, reopened after collapse', async () => {
    const fixture = await createComponent();
    const chat = () => el(fixture).querySelector<HTMLElement>('app-course-chat')!;
    const divider = () => el(fixture).querySelector<HTMLElement>('.module-editor__divider')!;
    expect(chat().hidden).toBe(false);
    expect(divider().hidden).toBe(false);

    // Repli : chat et poignée masqués par [hidden] (jamais détruits — la
    // future conversation doit survivre), bouton de réouverture disponible.
    el(fixture).querySelector<HTMLButtonElement>('.module-editor__chat-toggle')!.click();
    fixture.detectChanges();
    expect(chat().hidden).toBe(true);
    expect(divider().hidden).toBe(true);

    el(fixture).querySelector<HTMLButtonElement>('.module-editor__chat-reopen')!.click();
    fixture.detectChanges();
    expect(chat().hidden).toBe(false);
  });

  it('the handle resizes via keyboard, clamped to 15–85%', async () => {
    const fixture = await createComponent();
    const divider = el(fixture).querySelector<HTMLElement>('.module-editor__divider')!;
    expect(divider.getAttribute('aria-valuenow')).toBe('68');

    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(divider.getAttribute('aria-valuenow')).toBe('66');

    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(divider.getAttribute('aria-valuenow')).toBe('85');
  });

  it('load error: message + retry button', async () => {
    modulesMock.getModule.mockRejectedValueOnce(new Error('boom'));
    const fixture = await createComponent();
    expect(el(fixture).textContent).toContain('Impossible de charger');

    // Réessayer recharge (le cache du service est géré côté service).
    el(fixture).querySelector<HTMLButtonElement>('.module-editor__state .btn')!.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(modulesMock.getModule).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.htmlControl.value).toBe(DETAIL.html);
  });
  // ------------------------------------------------- flux HITL (contexte module)

  function proposal(
    kind: 'module_html' | 'module_css' | 'module_js',
    code: string,
  ): AssistantPendingProposal {
    return { kind, id: 'call_p', summary: 'Bouton en bleu', code };
  }

  it('scopes the anchored chat to the module and flushes autosave before each turn', async () => {
    const fixture = await createComponent();
    expect(assistantState.configure).toHaveBeenCalledTimes(1);
    expect(assistantState.configure).toHaveBeenCalledWith({
      context: 'module',
      moduleId: 'module-1',
    });

    // Le hook avant-tour est le flush d'autosave : une frappe non persistée
    // part AVANT que le back ne relise le module en base.
    const [[hook]] = assistantState.setBeforeTurn.mock.calls;
    fixture.componentInstance.cssControl.setValue('p { color: blue; }');
    await hook();
    expect(modulesMock.updateModule).toHaveBeenCalledWith('course-1', 'module-1', {
      html: DETAIL.html,
      css: 'p { color: blue; }',
      js: DETAIL.js,
    });

    // Rien de nouveau à persister : le hook est un no-op (jamais de PATCH vide).
    modulesMock.updateModule.mockClear();
    await hook();
    expect(modulesMock.updateModule).not.toHaveBeenCalled();
  });

  it('a proposal replaces the editor pane (never @if) and the preview runs the proposed code', async () => {
    const fixture = await createComponent();
    const pane = () => el(fixture).querySelector<HTMLElement>('.module-editor__pane')!;
    const runner = () => fixture.debugElement.query(By.directive(ModuleRunner)).componentInstance;
    expect(pane().classList.contains('module-editor__pane--reviewing')).toBe(false);
    expect(runner().css()).toBe(DETAIL.css);

    assistantState.pendingProposal.set(proposal('module_css', 'p { color: blue; }'));
    fixture.detectChanges();

    // Pane éditeur masqué par CLASSE (les trois Monaco survivent), revue montée.
    expect(pane().classList.contains('module-editor__pane--reviewing')).toBe(true);
    expect(el(fixture).querySelector('app-module-proposal-review')).not.toBeNull();
    // Aperçu : le fichier visé prend le code proposé, les autres sont intacts.
    expect(runner().css()).toBe('p { color: blue; }');
    expect(runner().html()).toBe(DETAIL.html);
    expect(runner().js()).toBe(DETAIL.js);

    // Fin de revue : retour automatique au code réel.
    assistantState.pendingProposal.set(null);
    fixture.detectChanges();
    expect(pane().classList.contains('module-editor__pane--reviewing')).toBe(false);
    expect(runner().css()).toBe(DETAIL.css);
  });

  it('accepting applies the file (Monaco when ready), reveals its tab and resumes the run', async () => {
    const fixture = await createComponent();
    assistantState.pendingProposal.set(proposal('module_js', "console.log('v2')"));
    fixture.detectChanges();

    const comment = el(fixture).querySelector<HTMLTextAreaElement>(
      '.proposal-decision__comment-input',
    )!;
    comment.value = 'Parfait';
    comment.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    el(fixture)
      .querySelector<HTMLButtonElement>('.proposal-decision__actions .btn--primary')!
      .click();
    await Promise.resolve();
    fixture.detectChanges();

    // Monaco inerte en jsdom : repli setValue (sans undo) — le contrôle porte
    // le code proposé, l'onglet du fichier est révélé, et la reprise est partie.
    expect(fixture.componentInstance.jsControl.value).toBe("console.log('v2')");
    expect(el(fixture).querySelector<HTMLElement>('[id$="-panel-js"]')!.hidden).toBe(false);
    expect(assistantState.resumeProposal).toHaveBeenCalledWith({
      accepted: true,
      comment: 'Parfait',
    });
  });

  it('accepting goes through Monaco when it is ready (undoable edit, no double write)', async () => {
    const fixture = await createComponent();
    const editor = fixture.componentInstance as unknown as {
      htmlEditor: () => { replaceAll: (text: string) => boolean };
    };
    const replaceAll = vi.spyOn(editor.htmlEditor(), 'replaceAll').mockReturnValue(true);

    assistantState.pendingProposal.set(proposal('module_html', '<p>V2</p>'));
    fixture.detectChanges();
    el(fixture)
      .querySelector<HTMLButtonElement>('.proposal-decision__actions .btn--primary')!
      .click();
    await Promise.resolve();

    expect(replaceAll).toHaveBeenCalledWith('<p>V2</p>');
    // Le contrôle n'est PAS réécrit : la propagation CVA de l'édit Monaco
    // suffit (un setValue viderait la pile d'annulation).
    expect(fixture.componentInstance.htmlControl.value).toBe(DETAIL.html);
  });

  it('rejecting resumes the run without touching the code', async () => {
    const fixture = await createComponent();
    assistantState.pendingProposal.set(proposal('module_css', 'p { color: blue; }'));
    fixture.detectChanges();

    el(fixture)
      .querySelector<HTMLButtonElement>('.proposal-decision__actions .btn--secondary')!
      .click();
    await Promise.resolve();

    expect(fixture.componentInstance.cssControl.value).toBe(DETAIL.css);
    expect(assistantState.resumeProposal).toHaveBeenCalledWith({ accepted: false });
  });

  it('a failed resume keeps the review, retryable', async () => {
    const fixture = await createComponent();
    assistantState.resumeProposal.mockResolvedValueOnce(false);
    assistantState.pendingProposal.set(proposal('module_js', 'x'));
    fixture.detectChanges();

    el(fixture)
      .querySelector<HTMLButtonElement>('.proposal-decision__actions .btn--secondary')!
      .click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(el(fixture).querySelector('app-module-proposal-review')).not.toBeNull();
    expect(el(fixture).querySelector('.proposal-decision__error')?.textContent).toContain(
      "Échec de l'envoi",
    );
  });
});
