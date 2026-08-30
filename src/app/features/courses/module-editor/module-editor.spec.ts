import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ModuleDetail } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';
import { ModuleRunner } from '../../../shared/module-runner/module-runner';
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

  async function configure(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ModuleEditor, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: ModuleService, useValue: modulesMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'course-1', moduleId: 'module-1' }) },
          },
        },
      ],
    }).compileComponents();
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
});
