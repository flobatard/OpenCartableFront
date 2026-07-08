import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BlockEditor } from './block-editor';
import { CourseBlock, CourseDetail } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { COURSE_DETAIL_FIXTURE } from '../../../testing/courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

/**
 * Monaco n'est jamais chargé en jsdom (le loader AMD reste inerte) : les
 * specs pilotent directement le FormControl public `content` de la page.
 * Les tests d'autosave utilisent les fake timers de vitest.
 */
describe('BlockEditor', () => {
  const detail = signal<CourseDetail | null>(COURSE_DETAIL_FIXTURE);
  const detailLoading = signal(false);
  const detailError = signal(false);
  const coursesMock = {
    detail,
    detailLoading,
    detailError,
    loadDetail: vi.fn(),
    updateBlockContent: vi.fn(),
  };

  const INITIAL = 'Introduction aux suites'; // content.markdown du block-1 de la fixture

  function updatedBlock(markdown: string): CourseBlock {
    return { ...COURSE_DETAIL_FIXTURE.blocks[0], content: { markdown } };
  }

  async function configure(blockId = 'block-1'): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BlockEditor, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseService, useValue: coursesMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'course-1', blockId }) } },
        },
      ],
    }).compileComponents();
  }

  async function createComponent(blockId = 'block-1'): Promise<ComponentFixture<BlockEditor>> {
    await configure(blockId);
    const fixture = TestBed.createComponent(BlockEditor);
    await fixture.whenStable();
    return fixture;
  }

  /** Variante synchrone pour les tests sous fake timers (whenStable y bloquerait). */
  function createComponentSync(): ComponentFixture<BlockEditor> {
    const fixture = TestBed.createComponent(BlockEditor);
    fixture.detectChanges();
    TestBed.tick(); // flush de l'effect d'init du contrôle
    return fixture;
  }

  function el(fixture: ComponentFixture<BlockEditor>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    detail.set(COURSE_DETAIL_FIXTURE);
    detailLoading.set(false);
    detailError.set(false);
    vi.clearAllMocks();
    coursesMock.updateBlockContent.mockResolvedValue(updatedBlock('x'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('charge le cours et initialise le contrôle une seule fois', async () => {
    const fixture = await createComponent();

    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
    expect(fixture.componentInstance.content.value).toBe(INITIAL);

    // Un patch du détail (ex. réponse d'un save) ne réécrit pas la frappe.
    detail.set({
      ...COURSE_DETAIL_FIXTURE,
      blocks: [updatedBlock('écrasé côté serveur'), COURSE_DETAIL_FIXTURE.blocks[1]],
    });
    TestBed.tick();
    await fixture.whenStable();

    expect(fixture.componentInstance.content.value).toBe(INITIAL);
  });

  it('autosave : rien avant 1,5 s, puis un PATCH avec la valeur courante', async () => {
    await configure();
    vi.useFakeTimers();
    const fixture = createComponentSync();

    fixture.componentInstance.content.setValue(`${INITIAL} — v2`);
    await vi.advanceTimersByTimeAsync(1499);
    expect(coursesMock.updateBlockContent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledWith('course-1', 'block-1', {
      markdown: `${INITIAL} — v2`,
    });

    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Enregistré');
  });

  it('des frappes rapprochées ne déclenchent qu’un seul PATCH', async () => {
    await configure();
    vi.useFakeTimers();
    const fixture = createComponentSync();

    fixture.componentInstance.content.setValue('a');
    await vi.advanceTimersByTimeAsync(500);
    fixture.componentInstance.content.setValue('ab');
    await vi.advanceTimersByTimeAsync(500);
    fixture.componentInstance.content.setValue('abc');
    await vi.advanceTimersByTimeAsync(1500);

    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledWith('course-1', 'block-1', {
      markdown: 'abc',
    });
  });

  it('sérialise un second PATCH si on tape pendant un save en vol', async () => {
    await configure();
    let resolveFirst!: (block: CourseBlock) => void;
    coursesMock.updateBlockContent
      .mockImplementationOnce(
        () => new Promise<CourseBlock>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValue(updatedBlock('ab'));
    vi.useFakeTimers();
    const fixture = createComponentSync();

    fixture.componentInstance.content.setValue('a');
    await vi.advanceTimersByTimeAsync(1500); // premier PATCH en vol
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);

    fixture.componentInstance.content.setValue('ab');
    await vi.advanceTimersByTimeAsync(1500); // débouncé, en file derrière concatMap
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);

    resolveFirst(updatedBlock('a'));
    await vi.advanceTimersByTimeAsync(0); // flush des microtâches
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(2);
    expect(coursesMock.updateBlockContent).toHaveBeenLastCalledWith('course-1', 'block-1', {
      markdown: 'ab',
    });
  });

  it('revenir à la valeur enregistrée n’émet aucun PATCH', async () => {
    await configure();
    vi.useFakeTimers();
    const fixture = createComponentSync();

    fixture.componentInstance.content.setValue(`${INITIAL}!`);
    fixture.componentInstance.content.setValue(INITIAL);
    await vi.advanceTimersByTimeAsync(1500);

    expect(coursesMock.updateBlockContent).not.toHaveBeenCalled();
  });

  it('échec du save : état erreur, puis le flux survit à la frappe suivante', async () => {
    await configure();
    coursesMock.updateBlockContent
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(updatedBlock('y'));
    vi.useFakeTimers();
    const fixture = createComponentSync();

    fixture.componentInstance.content.setValue('x');
    await vi.advanceTimersByTimeAsync(1500);
    fixture.detectChanges();
    expect(el(fixture).querySelector('.block-editor__save--error')).toBeTruthy();

    fixture.componentInstance.content.setValue('y');
    await vi.advanceTimersByTimeAsync(1500);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(2);
  });

  it('flush la valeur non débouncée à la destruction', async () => {
    await configure();
    vi.useFakeTimers();
    const fixture = createComponentSync();

    fixture.componentInstance.content.setValue('sortie rapide');
    fixture.destroy();

    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledWith('course-1', 'block-1', {
      markdown: 'sortie rapide',
    });
  });

  it('l’onglet aperçu rend le markdown local ; l’éditeur reste monté', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.content.setValue('## Section');
    await fixture.whenStable();

    (el(fixture).querySelector('#block-editor-tab-preview') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.block-editor__preview')?.innerHTML).toContain('<h2>');
    const editorPanel = el(fixture).querySelector<HTMLElement>('#block-editor-panel-editor');
    expect(editorPanel).toBeTruthy(); // masqué, pas détruit (monaco survivrait à la bascule)
    expect(editorPanel?.hidden).toBe(true);
  });

  it('l’aperçu rend les formules LaTeX via KaTeX', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.content.setValue('Soit $x^2$ un carré.');
    await fixture.whenStable();

    (el(fixture).querySelector('#block-editor-tab-preview') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.block-editor__preview .katex')).toBeTruthy();
  });

  it('bloc introuvable : message + pas d’éditeur', async () => {
    const fixture = await createComponent('inconnu');

    expect(el(fixture).textContent).toContain('existe pas ou a été supprimé');
    expect(el(fixture).querySelector('app-markdown-editor')).toBeNull();
  });

  it('type sans éditeur (lien) : message dédié', async () => {
    const fixture = await createComponent('block-2');

    expect(el(fixture).textContent).toContain('pas encore');
    expect(el(fixture).querySelector('app-markdown-editor')).toBeNull();
  });

  it('affiche l’erreur de chargement et relance via Réessayer', async () => {
    detail.set(null);
    detailError.set(true);
    const fixture = await createComponent();

    const retry = el(fixture).querySelector<HTMLButtonElement>('.block-editor__error .btn');
    expect(retry).toBeTruthy();

    coursesMock.loadDetail.mockClear();
    retry?.click();
    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
  });
});
