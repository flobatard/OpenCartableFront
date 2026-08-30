import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BlockEditor } from './block-editor';
import { CourseBlock, CourseDetail } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { addQuestion, ExerciseForm } from '../../../core/courses/exercise-form';
import { ModuleSummary } from '../../../core/modules/module.model';
import { ModuleService } from '../../../core/modules/module.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { DocumentEditor } from '../document-editor/document-editor';
import { ExerciseEditor } from '../exercise-editor/exercise-editor';
import { COURSE_DETAIL_FIXTURE } from '../../../testing/courses.fixture';
import { COURSE_RESOURCES_FIXTURE } from '../../../testing/resources.fixture';
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
    updateBlockMeta: vi.fn(),
    updateBlockResource: vi.fn(),
    updateBlockModule: vi.fn(),
  };
  const modulesMock = {
    list: signal<ModuleSummary[]>([]),
    listLoading: signal(false),
    listError: signal(false),
    loadList: vi.fn(),
    getModule: vi.fn().mockResolvedValue(null),
    createModule: vi.fn(),
    renameModule: vi.fn(),
    updateModule: vi.fn(),
    deleteModule: vi.fn(),
  };
  const resourcesMock = {
    list: signal(COURSE_RESOURCES_FIXTURE),
    listLoading: signal(false),
    listError: signal(false),
    uploadState: signal({ phase: 'idle' as const, progress: 0 }),
    loadList: vi.fn(),
    upload: vi.fn(),
    rename: vi.fn(),
    deleteResource: vi.fn(),
    // Résolue : l'aperçu embarqué du DocumentEditor présigne dès le montage
    // (un vi.fn() nu renverrait undefined → TypeError sur le .then de l'effect).
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.test/get/x'),
  };

  const INITIAL = 'Introduction aux suites'; // content.markdown du block-1 de la fixture

  function updatedBlock(markdown: string): CourseBlock {
    return { ...COURSE_DETAIL_FIXTURE.blocks[0], content: { markdown } };
  }

  // block-3 de la fixture : bloc exercice (sujet + une question q-1).
  const EXERCISE_BLOCK = COURSE_DETAIL_FIXTURE.blocks[2];
  const EXERCISE_SUJET = 'Étudier la convergence des suites suivantes.';
  const Q1 = {
    id: 'q-1',
    statement: 'Soit $u_n = 1/n$. Montrer que $(u_n)$ converge.',
    type: 'free_text',
    expected_answer: 'Décroissante et minorée par 0 ; limite 0.',
  };

  function updatedExerciseBlock(content: Record<string, unknown>): CourseBlock {
    return { ...EXERCISE_BLOCK, content };
  }

  /** Formulaire public de l'éditeur d'exercice enfant (piloté par les specs). */
  function exerciseForm(fixture: ComponentFixture<BlockEditor>): ExerciseForm {
    return (
      fixture.debugElement.query(By.directive(ExerciseEditor)).componentInstance as ExerciseEditor
    ).form;
  }

  async function configure(blockId = 'block-1'): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BlockEditor, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: CourseService, useValue: coursesMock },
        { provide: ResourceService, useValue: resourcesMock },
        { provide: ModuleService, useValue: modulesMock },
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

  function metaField(
    fixture: ComponentFixture<BlockEditor>,
    name: string,
  ): HTMLInputElement & HTMLTextAreaElement {
    return el(fixture).querySelector(`.block-editor__meta [formControlName="${name}"]`)!;
  }

  function metaSaveButton(fixture: ComponentFixture<BlockEditor>): HTMLButtonElement {
    return el(fixture).querySelector('.block-editor__meta button[type="submit"]')!;
  }

  function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    detail.set(COURSE_DETAIL_FIXTURE);
    detailLoading.set(false);
    detailError.set(false);
    vi.clearAllMocks();
    coursesMock.updateBlockContent.mockResolvedValue(updatedBlock('x'));
    coursesMock.updateBlockMeta.mockResolvedValue(COURSE_DETAIL_FIXTURE.blocks[0]);
    coursesMock.updateBlockResource.mockResolvedValue(COURSE_DETAIL_FIXTURE.blocks[1]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the course and initializes the control only once', async () => {
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

  it('autosave: nothing before 1.5 s, then one PATCH with the current value', async () => {
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

  it('rapid keystrokes trigger only one PATCH', async () => {
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

  it('serializes a second PATCH when typing during an in-flight save', async () => {
    await configure();
    let resolveFirst!: (block: CourseBlock) => void;
    coursesMock.updateBlockContent
      .mockImplementationOnce(() => new Promise<CourseBlock>((resolve) => (resolveFirst = resolve)))
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

  it('returning to the saved value emits no PATCH', async () => {
    await configure();
    vi.useFakeTimers();
    const fixture = createComponentSync();

    fixture.componentInstance.content.setValue(`${INITIAL}!`);
    fixture.componentInstance.content.setValue(INITIAL);
    await vi.advanceTimersByTimeAsync(1500);

    expect(coursesMock.updateBlockContent).not.toHaveBeenCalled();
  });

  it('save failure: error state, then the flow survives the next keystroke', async () => {
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

  it('flushes the undebounced value on destroy', async () => {
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

  it('text block: mounts the markdown field and initializes its control', async () => {
    const fixture = await createComponent();

    // Le contenu (éditeur/onglets/aperçu/aide) est délégué à app-markdown-field.
    expect(el(fixture).querySelector('app-markdown-field')).toBeTruthy();
    expect(fixture.componentInstance.content.value).toBe(INITIAL);
  });

  it('exercise block: mounts the exercise editor, the autosave bar and the assistant', async () => {
    const fixture = await createComponent('block-3');
    fixture.detectChanges();

    expect(el(fixture).querySelector('app-exercise-editor')).toBeTruthy();
    expect(el(fixture).querySelector('.block-editor__chat-toggle')).toBeTruthy();
    expect(el(fixture).querySelector('app-course-chat')).toBeTruthy();

    const form = exerciseForm(fixture);
    expect(form.controls.statement.value).toBe(EXERCISE_SUJET);
    expect(form.controls.questions.length).toBe(1);
    expect(form.controls.questions.at(0).controls.id.value).toBe('q-1');
  });

  it('exercise autosave: typing in the form → one debounced PATCH with the full payload', async () => {
    await configure('block-3');
    coursesMock.updateBlockContent.mockResolvedValue(
      updatedExerciseBlock({
        statement: EXERCISE_SUJET,
        questions: [{ ...Q1, expected_answer: 'Autre corrigé.' }],
      }),
    );
    vi.useFakeTimers();
    const fixture = createComponentSync();

    exerciseForm(fixture).controls.questions.at(0).controls.expectedAnswer.setValue(
      'Autre corrigé.',
    );
    await vi.advanceTimersByTimeAsync(1499);
    expect(coursesMock.updateBlockContent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledWith('course-1', 'block-3', {
      statement: EXERCISE_SUJET,
      questions: [{ ...Q1, expected_answer: 'Autre corrigé.' }],
    });

    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Enregistré');
  });

  it('writes the backend-generated ids into the form after save', async () => {
    await configure('block-3');
    coursesMock.updateBlockContent.mockResolvedValue(
      updatedExerciseBlock({
        statement: EXERCISE_SUJET,
        questions: [Q1, { id: 'q-généré', statement: '', type: 'free_text', expected_answer: '' }],
      }),
    );
    vi.useFakeTimers();
    const fixture = createComponentSync();
    const form = exerciseForm(fixture);

    addQuestion(form);
    await vi.advanceTimersByTimeAsync(1500);

    // La nouvelle question est partie sans id…
    const sent = coursesMock.updateBlockContent.mock.calls[0][2] as {
      questions: { id: string | null }[];
    };
    expect(sent.questions[1].id).toBeNull();
    // …et l'id généré par le back est réécrit dans le formulaire (stable à vie).
    expect(form.controls.questions.at(1).controls.id.value).toBe('q-généré');
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Enregistré');
  });

  it('typing during an in-flight exercise save: the second PATCH leaves with the rewritten ids', async () => {
    await configure('block-3');
    let resolveFirst!: (block: CourseBlock) => void;
    const withNewId = (statement: string): CourseBlock =>
      updatedExerciseBlock({
        statement: EXERCISE_SUJET,
        questions: [Q1, { id: 'q-généré', statement, type: 'free_text', expected_answer: '' }],
      });
    coursesMock.updateBlockContent
      .mockImplementationOnce(() => new Promise<CourseBlock>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(withNewId('Question ajoutée'));
    vi.useFakeTimers();
    const fixture = createComponentSync();
    const form = exerciseForm(fixture);

    addQuestion(form);
    await vi.advanceTimersByTimeAsync(1500); // premier PATCH en vol (id null)
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);

    form.controls.questions.at(1).controls.statement.setValue('Question ajoutée');
    await vi.advanceTimersByTimeAsync(1500); // débouncé, en file derrière concatMap
    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);

    resolveFirst(withNewId(''));
    await vi.advanceTimersByTimeAsync(0); // flush : write-back de q-généré puis 2e PATCH

    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(2);
    // Payload construit à l'ENVOI : l'id réécrit part avec, le back ne
    // régénérera pas un id censé être stable à vie.
    const second = coursesMock.updateBlockContent.mock.calls[1][2] as {
      questions: { id: string | null; statement: string }[];
    };
    expect(second.questions[1]).toEqual({
      id: 'q-généré',
      statement: 'Question ajoutée',
      type: 'free_text',
      expected_answer: '',
    });
  });

  it('flushes the undebounced exercise payload on destroy', async () => {
    await configure('block-3');
    vi.useFakeTimers();
    const fixture = createComponentSync();

    exerciseForm(fixture).controls.statement.setValue('Sortie rapide');
    fixture.destroy();

    expect(coursesMock.updateBlockContent).toHaveBeenCalledTimes(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledWith(
      'course-1',
      'block-3',
      expect.objectContaining({ statement: 'Sortie rapide' }),
    );
  });

  it('block not found: message + no field', async () => {
    const fixture = await createComponent('inconnu');

    expect(el(fixture).textContent).toContain('existe pas ou a été supprimé');
    expect(el(fixture).querySelector('app-markdown-field')).toBeNull();
  });

  it('module block: editable meta + module picker (library loaded)', async () => {
    detail.set({
      ...COURSE_DETAIL_FIXTURE,
      blocks: [
        ...COURSE_DETAIL_FIXTURE.blocks,
        {
          id: 'block-4',
          position: 3,
          type: 'module',
          title: null,
          description: null,
          content: {},
          resource_id: null,
          module_id: null,
        },
      ],
    });
    const fixture = await createComponent('block-4');

    // Le formulaire titre/description est présent (méta éditable sur tous types)…
    expect(metaField(fixture, 'title')).toBeTruthy();
    // …et le contenu est le picker de module (pas de Monaco ni de document).
    expect(el(fixture).querySelector('app-markdown-field')).toBeNull();
    expect(el(fixture).querySelector('app-document-editor')).toBeNull();
    expect(el(fixture).querySelector('app-module-block-editor')).toBeTruthy();
    // La bibliothèque de modules du cours a été chargée pour le picker.
    expect(modulesMock.loadList).toHaveBeenCalledWith('course-1');
  });

  it('document block: mounts the editor, loads the library and prefills', async () => {
    const fixture = await createComponent('block-2');
    fixture.detectChanges();

    expect(el(fixture).querySelector('app-document-editor')).toBeTruthy();
    // Bibliothèque du cours chargée une fois pour alimenter le picker.
    expect(resourcesMock.loadList).toHaveBeenCalledExactlyOnceWith('course-1');

    const editor = fixture.debugElement.query(By.directive(DocumentEditor))
      .componentInstance as DocumentEditor;
    expect(editor.form.controls.caption.value).toBe('Schéma récapitulatif');
    expect(editor.form.controls.display.value).toBe('inline');
    expect(editor.resourceControl.value).toBe('resource-1');

    // Le picker ne propose que les ressources « disponible » (+ option vide).
    const options = Array.from(el(fixture).querySelectorAll('.document-editor__select option'));
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'Aucune ressource',
      'schema-suites.pdf',
      'illustration.png',
    ]);
  });

  it('document autosave: typing in the caption → debounced PATCH of the content', async () => {
    await configure('block-2');
    coursesMock.updateBlockContent.mockResolvedValue({
      ...COURSE_DETAIL_FIXTURE.blocks[1],
      content: { caption: 'Nouvelle légende', display: 'inline' },
    });
    vi.useFakeTimers();
    const fixture = createComponentSync();
    fixture.detectChanges();

    const editor = fixture.debugElement.query(By.directive(DocumentEditor))
      .componentInstance as DocumentEditor;
    editor.form.controls.caption.setValue('Nouvelle légende');
    await vi.advanceTimersByTimeAsync(1499);
    expect(coursesMock.updateBlockContent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(coursesMock.updateBlockContent).toHaveBeenCalledExactlyOnceWith(
      'course-1',
      'block-2',
      { caption: 'Nouvelle légende', display: 'inline' },
    );
  });

  it('resource choice: immediate PATCH, no debounce, no content', async () => {
    const fixture = await createComponent('block-2');
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(DocumentEditor))
      .componentInstance as DocumentEditor;

    editor.resourceControl.setValue('resource-2');
    await fixture.whenStable();

    expect(coursesMock.updateBlockResource).toHaveBeenCalledExactlyOnceWith(
      'course-1',
      'block-2',
      'resource-2',
    );
    expect(coursesMock.updateBlockContent).not.toHaveBeenCalled();

    // L'option vide détache (`null` explicite).
    editor.resourceControl.setValue('');
    await fixture.whenStable();
    expect(coursesMock.updateBlockResource).toHaveBeenLastCalledWith(
      'course-1',
      'block-2',
      null,
    );
  });

  it('resource PATCH failure: dedicated message and select restored', async () => {
    coursesMock.updateBlockResource.mockRejectedValue(new Error('boom'));
    const fixture = await createComponent('block-2');
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(DocumentEditor))
      .componentInstance as DocumentEditor;

    editor.resourceControl.setValue('resource-2');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).textContent).toContain("ressource n'a pas pu être enregistré");
    // Revert : le select retombe sur la ressource réellement pointée par le bloc.
    expect(editor.resourceControl.value).toBe('resource-1');
  });

  it('meta form: initializes title/description from the block and disables the button', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(metaField(fixture, 'title').value).toBe('Le concept de suite');
    expect(metaField(fixture, 'description').value).toBe('Définitions et premiers exemples.');
    expect(metaSaveButton(fixture).disabled).toBe(true); // rien modifié
  });

  it('meta form: saves modified title/description via the button', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    type(metaField(fixture, 'title'), 'Titre modifié');
    fixture.detectChanges();
    expect(metaSaveButton(fixture).disabled).toBe(false); // modifié → actif

    metaSaveButton(fixture).click();
    await fixture.whenStable();

    // Envoie le méta complet (jamais le contenu) ; la description inchangée suit.
    expect(coursesMock.updateBlockMeta).toHaveBeenCalledWith('course-1', 'block-1', {
      title: 'Titre modifié',
      description: 'Définitions et premiers exemples.',
    });
    expect(coursesMock.updateBlockContent).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Enregistré');
  });

  it('meta form: clearing the title sends title null', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    type(metaField(fixture, 'title'), '');
    fixture.detectChanges();

    metaSaveButton(fixture).click();
    await fixture.whenStable();

    expect(coursesMock.updateBlockMeta).toHaveBeenCalledWith('course-1', 'block-1', {
      title: null,
      description: 'Définitions et premiers exemples.',
    });
  });

  it('shows the load error and retries via the retry button', async () => {
    detail.set(null);
    detailError.set(true);
    const fixture = await createComponent();

    const retry = el(fixture).querySelector<HTMLButtonElement>('.block-editor__error .btn');
    expect(retry).toBeTruthy();

    coursesMock.loadDetail.mockClear();
    retry?.click();
    expect(coursesMock.loadDetail).toHaveBeenCalledWith('course-1');
  });

  it('collapses and expands the chat panel via the toolbar button', async () => {
    const fixture = await createComponent();
    const toggle = el(fixture).querySelector<HTMLButtonElement>('.block-editor__chat-toggle')!;
    const chat = el(fixture).querySelector<HTMLElement>('app-course-chat')!;

    expect(chat.hidden).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(el(fixture).querySelector('.block-editor__chat-reopen')).toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(chat.hidden).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(el(fixture).querySelector('.block-editor__workspace--solo')).toBeTruthy();

    // Un bouton de réouverture apparaît près du chat (évite de remonter à la barre d'outils).
    const reopen = el(fixture).querySelector<HTMLButtonElement>('.block-editor__chat-reopen');
    expect(reopen).toBeTruthy();

    reopen!.click();
    fixture.detectChanges();
    expect(chat.hidden).toBe(false);
    expect(el(fixture).querySelector('.block-editor__chat-reopen')).toBeNull();
  });

  it('resizes via keyboard through the handle (aria-valuenow clamped)', async () => {
    const fixture = await createComponent();
    const divider = el(fixture).querySelector<HTMLElement>('.block-editor__divider')!;

    expect(divider.getAttribute('aria-valuenow')).toBe('64');

    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(divider.getAttribute('aria-valuenow')).toBe('66');

    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(divider.getAttribute('aria-valuenow')).toBe('85'); // borné au max
  });
});
