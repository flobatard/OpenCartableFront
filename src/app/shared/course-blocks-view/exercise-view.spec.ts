import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { COURSE_RESOURCE_RESOLVER } from '../../core/course-content/course-content-resolvers';
import { answerStorageKey, StoredBlockAnswers } from '../../core/student/answer-storage';
import { CorrectionRequest, QuestionCorrection } from '../../core/student/exercise-correction';
import { PUBLIC_COURSE_RESOURCES_FIXTURE } from '../../testing/public-courses.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ANSWER_SAVE_DEBOUNCE_MS, ExerciseView, ExerciseViewMode } from './exercise-view';

/** Content public d'un bloc exercice : jamais d'`expected_answer` (filtré par le back). */
const CONTENT = {
  statement: 'Étudier la convergence des suites suivantes.',
  questions: [
    { id: 'q-1', statement: 'Soit $u_n = 1/n$. Montrer que $(u_n)$ converge.', type: 'free_text' },
    { id: 'q-2', statement: 'Donner sa limite.', type: 'free_text' },
  ],
};

const KEY = answerStorageKey('course-1', 'block-3');

function seed(key: string, answers: StoredBlockAnswers['answers']): void {
  localStorage.setItem(key, JSON.stringify({ version: 2, answers }));
}

function stored(key = KEY): StoredBlockAnswers | null {
  const raw = localStorage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as StoredBlockAnswers);
}

interface Inputs {
  mode: ExerciseViewMode;
  blockId: string;
  correctionEnabled: boolean;
  corrections: Record<string, QuestionCorrection>;
}

describe('ExerciseView', () => {
  const resolverMock = {
    list: signal(PUBLIC_COURSE_RESOURCES_FIXTURE),
    listLoading: signal(false),
    ensureList: vi.fn(),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.test/presigned'),
    contentUrl: vi.fn(),
  };

  async function createComponent(
    inputs: Partial<Inputs> = {},
  ): Promise<ComponentFixture<ExerciseView>> {
    await TestBed.configureTestingModule({
      imports: [ExerciseView, provideTranslocoTesting()],
      // Résolveur public : la vue ne doit jamais retomber sur l'impl. prof (OIDC).
      providers: [{ provide: COURSE_RESOURCE_RESOLVER, useValue: resolverMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExerciseView);
    fixture.componentRef.setInput('content', CONTENT);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('blockId', inputs.blockId ?? 'block-3');
    fixture.componentRef.setInput('mode', inputs.mode ?? 'preview');
    fixture.componentRef.setInput('correctionEnabled', inputs.correctionEnabled ?? false);
    fixture.componentRef.setInput('corrections', inputs.corrections ?? {});
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<ExerciseView>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function textareas(fixture: ComponentFixture<ExerciseView>): HTMLTextAreaElement[] {
    return Array.from(el(fixture).querySelectorAll('textarea.exercise-view__answer'));
  }

  function titles(fixture: ComponentFixture<ExerciseView>): string[] {
    return Array.from(el(fixture).querySelectorAll('.exercise-view__question-title')).map(
      (h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  function type(field: HTMLTextAreaElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('preview mode (default)', () => {
    it('renders the subject, then one numbered card per question, without any answer field', async () => {
      const fixture = await createComponent();

      expect(el(fixture).querySelector('.exercise-view__subject')?.textContent).toContain(
        'Étudier la convergence des suites suivantes.',
      );
      expect(titles(fixture)).toEqual(['Question 1', 'Question 2']);
      expect(el(fixture).querySelector('.exercise-view__question')?.textContent).toContain(
        'Montrer que',
      );
      expect(textareas(fixture)).toEqual([]);
      expect(el(fixture).querySelector('.exercise-view__footer')).toBeNull();
      expect(el(fixture).querySelector('[role="alert"]')).toBeNull();
    });

    it('never reads nor writes the student answers', async () => {
      seed(KEY, { 'q-1': { text: 'brouillon', locked: false, updatedAt: '' } });
      const getItem = vi.spyOn(localStorage, 'getItem');

      await createComponent();

      expect(getItem).not.toHaveBeenCalledWith(KEY);
      expect(stored()?.answers['q-1']?.text).toBe('brouillon');
    });

    it('renders no correction even when one is provided', async () => {
      const fixture = await createComponent({
        correctionEnabled: true,
        corrections: { 'q-1': { status: 'done', feedback: 'Bien.' } },
      });

      expect(el(fixture).querySelector('.exercise-view__correction')).toBeNull();
      expect(el(fixture).querySelector('.exercise-view__correction-request')).toBeNull();
    });
  });

  describe('solve mode', () => {
    it('restores the answers persisted for (course, block), one textarea per question', async () => {
      seed(KEY, {
        'q-1': { text: 'Décroissante et minorée.', locked: false, updatedAt: '' },
      });
      const fixture = await createComponent({ mode: 'solve' });

      const [first, second] = textareas(fixture);
      expect(first.value).toBe('Décroissante et minorée.');
      expect(second.value).toBe('');
      expect(el(fixture).querySelector('.exercise-view__saved-hint')).not.toBeNull();
      expect(el(fixture).querySelector('[role="alert"]')).toBeNull();
    });

    it('persists a typed answer after the debounce, under the (course, block) key', async () => {
      const fixture = await createComponent({ mode: 'solve' });
      vi.useFakeTimers();

      type(textareas(fixture)[0], 'Limite 0.');
      expect(stored()).toBeNull();

      vi.advanceTimersByTime(ANSWER_SAVE_DEBOUNCE_MS);
      expect(stored()?.version).toBe(2);
      expect(stored()?.answers['q-1']).toMatchObject({ text: 'Limite 0.', locked: false });
    });

    it('flushes a pending answer when destroyed before the debounce', async () => {
      const fixture = await createComponent({ mode: 'solve' });
      vi.useFakeTimers();

      type(textareas(fixture)[1], 'Zéro.');
      fixture.destroy();

      expect(stored()?.answers['q-2']?.text).toBe('Zéro.');
    });

    it('locks a question on « Marquer comme terminé » and persists at once', async () => {
      const fixture = await createComponent({ mode: 'solve' });
      const button = el(fixture).querySelector<HTMLButtonElement>(
        '.exercise-view__question-actions .btn--secondary',
      )!;
      expect(button.textContent?.trim()).toBe('Marquer comme terminé');

      button.click();
      await fixture.whenStable();

      expect(textareas(fixture)[0].readOnly).toBe(true);
      expect(titles(fixture)[0]).toBe('Question 1 Terminé');
      expect(button.textContent?.trim()).toBe('Modifier');
      expect(stored()?.answers['q-1']).toMatchObject({ text: '', locked: true });
    });

    it('clears every answer in two steps, disarmed on blur', async () => {
      seed(KEY, { 'q-1': { text: 'x', locked: false, updatedAt: '' } });
      const fixture = await createComponent({ mode: 'solve' });
      const clear = () => el(fixture).querySelector<HTMLButtonElement>('.exercise-view__clear');

      clear()!.click();
      await fixture.whenStable();
      expect(clear()!.textContent?.trim()).toBe("Confirmer l'effacement");
      expect(stored()).not.toBeNull();

      clear()!.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      expect(clear()!.textContent?.trim()).toBe('Effacer mes réponses');

      clear()!.click();
      await fixture.whenStable();
      clear()!.click();
      await fixture.whenStable();

      expect(stored()).toBeNull();
      expect(textareas(fixture)[0].value).toBe('');
      expect(clear()).toBeNull();
    });

    it('warns when storage is unavailable but still lets the student type', async () => {
      // Navigation privée stricte / quota : l'objet existe mais refuse d'écrire.
      vi.stubGlobal('localStorage', {
        length: 0,
        key: () => null,
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => undefined,
        clear: () => undefined,
      });
      const fixture = await createComponent({ mode: 'solve' });

      expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
      expect(el(fixture).querySelector('.exercise-view__saved-hint')).toBeNull();

      type(textareas(fixture)[0], 'Sans persistance');
      await fixture.whenStable();
      expect(textareas(fixture)[0].value).toBe('Sans persistance');
    });

    it('switches key when the block changes: flushes under the old key, restores the new one', async () => {
      seed(answerStorageKey('course-1', 'block-9'), {
        'q-1': { text: 'Autre bloc', locked: false, updatedAt: '' },
      });
      const fixture = await createComponent({ mode: 'solve' });

      type(textareas(fixture)[0], 'Bloc 3');
      fixture.componentRef.setInput('blockId', 'block-9');
      await fixture.whenStable();

      expect(stored(KEY)?.answers['q-1']?.text).toBe('Bloc 3');
      expect(textareas(fixture)[0].value).toBe('Autre bloc');
    });
  });

  describe('correction slot (dormant until the AI call exists)', () => {
    it('renders neither a request button nor a panel by default', async () => {
      seed(KEY, { 'q-1': { text: 'x', locked: false, updatedAt: '' } });
      const fixture = await createComponent({ mode: 'solve' });

      expect(el(fixture).querySelector('.exercise-view__correction-request')).toBeNull();
      expect(el(fixture).querySelector('.exercise-view__correction')).toBeNull();
    });

    it('offers the request only when enabled and answered, and emits the request', async () => {
      const fixture = await createComponent({ mode: 'solve', correctionEnabled: true });
      const requested: CorrectionRequest[] = [];
      fixture.componentInstance.correctionRequested.subscribe((r) => requested.push(r));
      const request = () =>
        el(fixture).querySelector<HTMLButtonElement>('.exercise-view__correction-request');

      // Pas de réponse saisie : rien à corriger.
      expect(request()).toBeNull();

      type(textareas(fixture)[0], 'Ma réponse');
      await fixture.whenStable();
      expect(request()).not.toBeNull();

      request()!.click();
      expect(requested).toEqual([{ blockId: 'block-3', questionId: 'q-1', answer: 'Ma réponse' }]);
    });

    it('renders the correction states provided per question', async () => {
      const fixture = await createComponent({
        mode: 'solve',
        corrections: {
          'q-1': { status: 'pending' },
          'q-2': { status: 'done', feedback: '**Bien** vu.' },
        },
      });

      const panels = el(fixture).querySelectorAll('.exercise-view__correction');
      expect(panels.length).toBe(2);
      expect(panels[0].querySelector('app-spinner')).not.toBeNull();
      expect(panels[1].querySelector('strong')?.textContent).toBe('Bien');

      fixture.componentRef.setInput('corrections', { 'q-1': { status: 'error' } });
      await fixture.whenStable();

      expect(el(fixture).querySelectorAll('.exercise-view__correction').length).toBe(1);
      expect(el(fixture).querySelector('.exercise-view__correction-error')).not.toBeNull();
    });
  });
});
