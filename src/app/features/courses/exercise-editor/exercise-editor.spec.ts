import { signal } from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ExerciseEditor } from './exercise-editor';
import { ExerciseContentPayload } from '../../../core/courses/course.model';
import { ExerciseQuestionGroup, QUESTIONS_MAX } from '../../../core/courses/exercise-form';
import { ModuleService } from '../../../core/modules/module.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { MarkdownField } from '../../../shared/markdown-field/markdown-field';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

/**
 * Composant présentationnel : `initial` posé avant le premier detectChanges,
 * `contentChange` observé par spy. Monaco est inerte en jsdom — les frappes
 * dans les énoncés passent par le formulaire public.
 */
describe('ExerciseEditor', () => {
  const CONTENT = {
    statement: 'Résoudre les équations suivantes.',
    questions: [
      { id: 'q-1', statement: 'Résoudre $x^2 = 4$.', type: 'free_text', expected_answer: 'x = ±2' },
      { id: 'q-2', statement: 'Résoudre $x^3 = 8$.', type: 'free_text', expected_answer: 'x = 2' },
    ],
  };

  // markdown-field (picker) et markdown-view (aperçu) injectent ResourceService.
  const resourcesMock = {
    list: signal([]),
    listLoading: signal(false),
    loadList: vi.fn(),
    getDownloadUrl: vi.fn(),
  };
  // markdown-field injecte aussi ModuleService (picker de module).
  const modulesMock = {
    list: signal([]),
    listLoading: signal(false),
    loadList: vi.fn(),
    getModule: vi.fn(),
  };

  async function createComponent(
    initial: Record<string, unknown> = CONTENT,
  ): Promise<ComponentFixture<ExerciseEditor>> {
    await TestBed.configureTestingModule({
      imports: [ExerciseEditor, provideTranslocoTesting()],
      // provideRouter : les markdown-field embarqués montent la modale d'aide (RouterLink).
      providers: [
        provideRouter([]),
        { provide: ResourceService, useValue: resourcesMock },
        { provide: ModuleService, useValue: modulesMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExerciseEditor);
    fixture.componentRef.setInput('initial', initial);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<ExerciseEditor>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function emissions(fixture: ComponentFixture<ExerciseEditor>): ExerciseContentPayload[] {
    const seen: ExerciseContentPayload[] = [];
    fixture.componentInstance.contentChange.subscribe((p) => seen.push(p));
    return seen;
  }

  it('initializes the form only once from initial', async () => {
    const fixture = await createComponent();
    const form = fixture.componentInstance.form;

    expect(form.controls.statement.value).toBe('Résoudre les équations suivantes.');
    expect(form.controls.questions.length).toBe(2);
    expect(form.controls.questions.at(0).getRawValue()).toEqual({
      id: 'q-1',
      statement: 'Résoudre $x^2 = 4$.',
      expectedAnswer: 'x = ±2',
    });

    // Un changement de référence de l'input (patch du détail post-save) ne
    // re-patche pas : la frappe en cours serait écrasée.
    form.controls.statement.setValue('Frappe en cours');
    fixture.componentRef.setInput('initial', { statement: 'Écrasé côté serveur', questions: [] });
    fixture.detectChanges();

    expect(form.controls.statement.value).toBe('Frappe en cours');
    expect(form.controls.questions.length).toBe(2);
  });

  it('emits the full payload on every keystroke', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);

    fixture.componentInstance.form.controls.questions
      .at(0)
      .controls.expectedAnswer.setValue('x ∈ {−2, 2}');

    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual({
      statement: 'Résoudre les équations suivantes.',
      questions: [
        {
          id: 'q-1',
          statement: 'Résoudre $x^2 = 4$.',
          type: 'free_text',
          expected_answer: 'x ∈ {−2, 2}',
        },
        { id: 'q-2', statement: 'Résoudre $x^3 = 8$.', type: 'free_text', expected_answer: 'x = 2' },
      ],
    });
  });

  it('Statement/Questions tabs: switched via [hidden], panels never destroyed', async () => {
    const fixture = await createComponent();
    const panels = el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__panel');
    const tabs = el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__tabbar .tab');
    const [sujetPanel, questionsPanel] = Array.from(panels);
    const [statementTab, questionsTab] = Array.from(tabs);

    // Sujet actif par défaut ; le compteur de questions est porté par l'onglet.
    expect(sujetPanel.hidden).toBe(false);
    expect(questionsPanel.hidden).toBe(true);
    expect(statementTab.getAttribute('aria-selected')).toBe('true');
    expect(questionsTab.textContent).toContain('2');

    questionsTab.click();
    fixture.detectChanges();

    expect(sujetPanel.hidden).toBe(true);
    expect(questionsPanel.hidden).toBe(false);
    expect(questionsTab.getAttribute('aria-selected')).toBe('true');
    // Les panneaux restent montés ([hidden], jamais @if) : Monaco n'est pas rechargé.
    expect(sujetPanel.querySelector('app-markdown-field')).toBeTruthy();

    // Flèche gauche depuis le tablist : retour au sujet, focus déplacé (APG).
    questionsTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(sujetPanel.hidden).toBe(false);
    expect(statementTab.getAttribute('aria-selected')).toBe('true');
  });

  it('full preview: concatenates statement + question statements, rendered on the active tab', async () => {
    const fixture = await createComponent();
    const tabs = el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__tabbar .tab');
    const previewTab = Array.from(tabs)[2];

    // Panneau aperçu absent (@if) tant que l'onglet n'est pas actif.
    expect(el(fixture).querySelector('.exercise-editor__preview')).toBeNull();

    previewTab.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(previewTab.getAttribute('aria-selected')).toBe('true');
    const preview = el(fixture).querySelector<HTMLElement>('.exercise-editor__preview');
    expect(preview).toBeTruthy();
    // Sujet + les deux énoncés rendus d'un seul tenant.
    expect(preview!.textContent).toContain('Résoudre les équations suivantes.');
    expect(preview!.textContent).toContain('=');
    expect(preview!.querySelectorAll('p').length).toBe(3);
  });

  it('full preview: empty state when there is nothing to preview', async () => {
    const fixture = await createComponent({ statement: '', questions: [] });
    const tabs = el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__tabbar .tab');
    Array.from(tabs)[2].click();
    fixture.detectChanges();

    const panel = el(fixture).querySelector<HTMLElement>('.exercise-editor__panel--preview');
    expect(panel).toBeTruthy();
    expect(panel!.querySelector('.exercise-editor__preview')).toBeNull();
    expect(panel!.querySelector('.exercise-editor__empty')).toBeTruthy();
  });

  it('empty state: message shown, add creates a question and emits', async () => {
    const fixture = await createComponent({ statement: '', questions: [] });
    const seen = emissions(fixture);

    expect(el(fixture).querySelector('.exercise-editor__empty')).toBeTruthy();

    el(fixture).querySelector<HTMLButtonElement>('.exercise-editor__add')!.click();
    fixture.detectChanges();

    expect(el(fixture).querySelector('.exercise-editor__empty')).toBeNull();
    expect(el(fixture).querySelectorAll('.exercise-editor__question').length).toBe(1);
    expect(seen.length).toBe(1);
    expect(seen[0].questions).toEqual([
      { id: null, statement: '', type: 'free_text', expected_answer: '' },
    ]);
  });

  it('deletes in two steps, disarmed on blur', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);
    const deleteBtn = (): HTMLButtonElement =>
      el(fixture).querySelector<HTMLButtonElement>('.exercise-editor__delete')!;

    deleteBtn().click(); // arme
    fixture.detectChanges();
    expect(deleteBtn().classList.contains('exercise-editor__delete--armed')).toBe(true);
    expect(seen.length).toBe(0); // rien supprimé, rien émis

    deleteBtn().dispatchEvent(new Event('blur')); // désarme
    fixture.detectChanges();
    expect(deleteBtn().classList.contains('exercise-editor__delete--armed')).toBe(false);

    deleteBtn().click(); // ré-arme
    deleteBtn().click(); // confirme
    fixture.detectChanges();

    expect(el(fixture).querySelectorAll('.exercise-editor__question').length).toBe(1);
    expect(seen.at(-1)!.questions.map((q) => q.id)).toEqual(['q-2']);
  });

  it('moves a question (bounds disabled) and emits the new order', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);
    const moveButtons = el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__move');

    // [monter q1, descendre q1, monter q2, descendre q2]
    expect(moveButtons[0].disabled).toBe(true); // q1 ne monte pas
    expect(moveButtons[3].disabled).toBe(true); // q2 ne descend pas

    moveButtons[1].click(); // descendre q1
    fixture.detectChanges();

    expect(seen.at(-1)!.questions.map((q) => q.id)).toEqual(['q-2', 'q-1']);
    const titles = el(fixture).querySelectorAll('.exercise-editor__question-title');
    expect(titles.length).toBe(2);
  });

  it('drag-and-drop reorders the questions and emits once (Monaco preserved)', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);

    // jsdom ne peut pas simuler un vrai drag pointeur CDK : on appelle le handler
    // du drop avec un événement factice (previousIndex/currentIndex seulement).
    (
      fixture.componentInstance as unknown as {
        drop(e: CdkDragDrop<ExerciseQuestionGroup[]>): void;
      }
    ).drop({ previousIndex: 0, currentIndex: 1 } as CdkDragDrop<ExerciseQuestionGroup[]>);
    fixture.detectChanges();

    expect(seen.at(-1)!.questions.map((q) => q.id)).toEqual(['q-2', 'q-1']);
    expect(seen.length).toBe(1); // une seule émission pour le déplacement
    // Les deux énoncés restent montés (instances réutilisées, Monaco non détruit).
    expect(
      el(fixture).querySelectorAll('.exercise-editor__question-body app-markdown-field').length,
    ).toBe(2);
  });

  it('the handle reorders questions via keyboard', async () => {
    const fixture = await createComponent();
    const seen = emissions(fixture);
    const grip = el(fixture).querySelector<HTMLElement>('.drag-handle')!;

    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    fixture.detectChanges();

    expect(seen.at(-1)!.questions.map((q) => q.id)).toEqual(['q-2', 'q-1']);
  });

  it('accordion: a single question expanded, bodies stay mounted (Monaco preserved)', async () => {
    const fixture = await createComponent();
    const toggles = el(fixture).querySelectorAll<HTMLButtonElement>(
      '.exercise-editor__question-toggle',
    );
    const bodies = el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__question-body');

    // Première question dépliée par défaut ; la seconde repliée.
    expect(toggles.length).toBe(2);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(bodies[0].hidden).toBe(false);
    expect(bodies[1].hidden).toBe(true);
    // Les deux énoncés restent montés ([hidden], jamais @if) : Monaco non détruit.
    expect(
      el(fixture).querySelectorAll('.exercise-editor__question-body app-markdown-field').length,
    ).toBe(2);

    // La question repliée montre un aperçu de son énoncé ; l'ouverte non.
    const previews = () =>
      el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__question-preview');
    expect(previews().length).toBe(1);
    expect(previews()[0].textContent?.trim()).toBe('Résoudre $x^3 = 8$.');

    // Déplier la seconde replie la première (une seule ouverte à la fois).
    toggles[1].click();
    fixture.detectChanges();
    expect(bodies[0].hidden).toBe(true);
    expect(bodies[1].hidden).toBe(false);
    // L'aperçu suit : désormais sur la première (repliée).
    expect(previews()[0].textContent?.trim()).toBe('Résoudre $x^2 = 4$.');

    // Recliquer la question ouverte la replie (tout peut être fermé).
    toggles[1].click();
    fixture.detectChanges();
    expect(bodies[1].hidden).toBe(true);
  });

  it('adding expands the new question', async () => {
    const fixture = await createComponent();

    el(fixture).querySelector<HTMLButtonElement>('.exercise-editor__add')!.click();
    fixture.detectChanges();

    const toggles = el(fixture).querySelectorAll<HTMLButtonElement>(
      '.exercise-editor__question-toggle',
    );
    expect(toggles.length).toBe(3);
    // Seule la dernière (nouvelle) est dépliée.
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[2].getAttribute('aria-expanded')).toBe('true');
  });

  describe('application des propositions de l’assistant (HITL par question)', () => {
    /** Champs markdown montés : [sujet, énoncé q-1, énoncé q-2] (ordre DOM). */
    function fields(fixture: ComponentFixture<ExerciseEditor>): MarkdownField[] {
      return fixture.debugElement
        .queryAll(By.directive(MarkdownField))
        .map((d) => d.componentInstance as MarkdownField);
    }

    function expanded(fixture: ComponentFixture<ExerciseEditor>): boolean[] {
      return Array.from(
        el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__question-toggle'),
      ).map((t) => t.getAttribute('aria-expanded') === 'true');
    }

    it('applyStatement: jsdom fallback writes the control, emits and shows the Subject tab', async () => {
      const fixture = await createComponent();
      const seen = emissions(fixture);
      el(fixture).querySelectorAll<HTMLButtonElement>('.exercise-editor__tabbar .tab')[1].click();
      fixture.detectChanges();

      expect(fixture.componentInstance.applyStatement('Nouveau sujet')).toBe(true);
      fixture.detectChanges();

      expect(fixture.componentInstance.form.controls.statement.value).toBe('Nouveau sujet');
      expect(seen.at(-1)?.statement).toBe('Nouveau sujet');
      const [sujetPanel] = Array.from(el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__panel'));
      expect(sujetPanel.hidden).toBe(false);
    });

    it('applyStatement: goes through the Monaco edit when available (Ctrl-Z friendly)', async () => {
      const fixture = await createComponent();
      const replaceAll = vi.spyOn(fields(fixture)[0], 'replaceAll').mockReturnValue(true);

      fixture.componentInstance.applyStatement('Nouveau sujet');

      expect(replaceAll).toHaveBeenCalledWith('Nouveau sujet');
      // Pas de setValue en double : la propagation CVA de Monaco fera le reste.
      expect(fixture.componentInstance.form.controls.statement.value).toBe(
        'Résoudre les équations suivantes.',
      );
    });

    it('applyQuestionEdit: patches the targeted question (id kept), emits and reveals it', async () => {
      const fixture = await createComponent();
      const seen = emissions(fixture);

      expect(
        fixture.componentInstance.applyQuestionEdit('q-2', {
          statement: 'Résoudre $x^3 = 27$.',
          expectedAnswer: 'x = 3',
        }),
      ).toBe(true);
      fixture.detectChanges();

      expect(fixture.componentInstance.form.controls.questions.at(1).getRawValue()).toEqual({
        id: 'q-2',
        statement: 'Résoudre $x^3 = 27$.',
        expectedAnswer: 'x = 3',
      });
      expect(seen.at(-1)?.questions[1].expected_answer).toBe('x = 3');
      // Onglet Questions actif, q-2 dépliée (q-1 repliée).
      const [, questionsPanel] = Array.from(
        el(fixture).querySelectorAll<HTMLElement>('.exercise-editor__panel'),
      );
      expect(questionsPanel.hidden).toBe(false);
      expect(expanded(fixture)).toEqual([false, true]);
    });

    it('applyQuestionEdit: a null field is left untouched; an unknown id applies nothing', async () => {
      const fixture = await createComponent();
      const seen = emissions(fixture);

      fixture.componentInstance.applyQuestionEdit('q-1', { statement: null, expectedAnswer: '±2' });
      expect(fixture.componentInstance.form.controls.questions.at(0).getRawValue()).toEqual({
        id: 'q-1',
        statement: 'Résoudre $x^2 = 4$.',
        expectedAnswer: '±2',
      });

      const before = seen.length;
      expect(
        fixture.componentInstance.applyQuestionEdit('disparue', { statement: 'x', expectedAnswer: null }),
      ).toBe(false);
      expect(seen.length).toBe(before);
    });

    it('applyQuestionEdit: the statement goes through the question’s Monaco when available', async () => {
      const fixture = await createComponent();
      const replaceAll = vi.spyOn(fields(fixture)[2], 'replaceAll').mockReturnValue(true);

      fixture.componentInstance.applyQuestionEdit('q-2', { statement: 'Via Monaco', expectedAnswer: null });

      expect(replaceAll).toHaveBeenCalledWith('Via Monaco');
      expect(fixture.componentInstance.form.controls.questions.at(1).controls.statement.value).toBe(
        'Résoudre $x^3 = 8$.',
      );
    });

    it('applyQuestionAdd: inserts a new (null id) question after the anchor, emits and reveals it', async () => {
      const fixture = await createComponent();
      const seen = emissions(fixture);

      expect(
        fixture.componentInstance.applyQuestionAdd({
          statement: 'Entre les deux',
          expectedAnswer: 'Oui.',
          afterId: 'q-1',
        }),
      ).toBe(true);
      fixture.detectChanges();

      expect(seen.at(-1)?.questions.map((q) => q.id)).toEqual(['q-1', null, 'q-2']);
      expect(seen.at(-1)?.questions[1]).toEqual({
        id: null,
        statement: 'Entre les deux',
        type: 'free_text',
        expected_answer: 'Oui.',
      });
      expect(expanded(fixture)).toEqual([false, true, false]);

      // Sans ancre : en fin d'exercice.
      fixture.componentInstance.applyQuestionAdd({ statement: 'Fin', expectedAnswer: '', afterId: null });
      expect(seen.at(-1)?.questions.map((q) => q.statement).at(-1)).toBe('Fin');
    });

    it('applyQuestionAdd: refuses beyond the question cap', async () => {
      const fixture = await createComponent({
        statement: '',
        questions: Array.from({ length: QUESTIONS_MAX }, (_, i) => ({
          id: `q-${i}`,
          statement: `Q${i}`,
          type: 'free_text',
          expected_answer: '',
        })),
      });
      const seen = emissions(fixture);

      expect(
        fixture.componentInstance.applyQuestionAdd({ statement: 'Trop', expectedAnswer: '', afterId: null }),
      ).toBe(false);
      expect(seen.length).toBe(0);
    });

    it('applyQuestionDelete: removes the question and emits; unknown id applies nothing', async () => {
      const fixture = await createComponent();
      const seen = emissions(fixture);

      expect(fixture.componentInstance.applyQuestionDelete('q-1')).toBe(true);
      fixture.detectChanges();
      expect(seen.at(-1)?.questions.map((q) => q.id)).toEqual(['q-2']);
      expect(el(fixture).querySelectorAll('.exercise-editor__question').length).toBe(1);
      // La voisine restante est dépliée à sa place.
      expect(expanded(fixture)).toEqual([true]);

      expect(fixture.componentInstance.applyQuestionDelete('q-1')).toBe(false);
      expect(seen.length).toBe(1);
    });
  });

  describe('student submissions (teacher clearing)', () => {
    it('shows nothing without a summary', async () => {
      const fixture = await createComponent();
      expect(el(fixture).querySelector('.exercise-editor__clear-submissions')).toBeNull();
      expect(el(fixture).querySelector('.exercise-editor__clear-all-submissions')).toBeNull();
    });

    it('offers per-question and whole-exercise clearing in two steps', async () => {
      const fixture = await createComponent();
      fixture.componentRef.setInput('submissionCounts', { 'q-1': 3 });
      fixture.componentRef.setInput('submissionTotal', 3);
      await fixture.whenStable();
      const requested: { questionId: string | null }[] = [];
      fixture.componentInstance.submissionsClearRequested.subscribe((r) => requested.push(r));

      const perQuestion = el(fixture).querySelectorAll<HTMLButtonElement>(
        '.exercise-editor__clear-submissions',
      );
      // Seule q-1 a des tentatives connues.
      expect(perQuestion.length).toBe(1);
      expect(perQuestion[0].textContent).toContain('3');
      perQuestion[0].click();
      expect(requested).toEqual([]);
      perQuestion[0].click();
      expect(requested).toEqual([{ questionId: 'q-1' }]);

      const all = el(fixture).querySelector<HTMLButtonElement>(
        '.exercise-editor__clear-all-submissions',
      )!;
      all.click();
      all.dispatchEvent(new Event('blur'));
      all.click();
      expect(requested.length).toBe(1);
      all.click();
      expect(requested[1]).toEqual({ questionId: null });
    });
  });
});
