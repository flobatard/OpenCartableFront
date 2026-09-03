import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { COURSE_RESOURCE_RESOLVER } from '../../core/course-content/course-content-resolvers';
import { answerStorageKey, StoredBlockAnswers } from '../../core/student/answer-storage';
import {
  CorrectionRequest,
  QuestionThread,
  SubmissionTurn,
  ThreadsClearRequest,
} from '../../core/student/exercise-correction';
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

function turn(overrides: Partial<SubmissionTurn> & { id: string }): SubmissionTurn {
  return {
    kind: 'answer',
    content: '',
    feedback: null,
    verdict: null,
    effort: null,
    revealed: false,
    created_at: '2026-09-03T10:00:00Z',
    ...overrides,
  };
}

function doneThread(
  feedback: string,
  verdict: SubmissionTurn['verdict'] = 'incorrect',
): QuestionThread {
  return {
    turns: [turn({ id: 't1', content: 'Ma réponse', feedback, verdict })],
    live: null,
    error: null,
    revealedAnswer: null,
  };
}

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
  correctionLoginHint: boolean;
  threads: Record<string, QuestionThread>;
  blockLink: ((blockId: string) => string[]) | null;
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
      providers: [
        // Résolveur public : la vue ne doit jamais retomber sur l'impl. prof (OIDC).
        { provide: COURSE_RESOURCE_RESOLVER, useValue: resolverMock },
        provideRouter([{ path: '**', children: [] }]),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExerciseView);
    fixture.componentRef.setInput('content', CONTENT);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('blockId', inputs.blockId ?? 'block-3');
    fixture.componentRef.setInput('mode', inputs.mode ?? 'preview');
    fixture.componentRef.setInput('correctionEnabled', inputs.correctionEnabled ?? false);
    fixture.componentRef.setInput('correctionLoginHint', inputs.correctionLoginHint ?? false);
    fixture.componentRef.setInput('threads', inputs.threads ?? {});
    fixture.componentRef.setInput('blockLink', inputs.blockLink ?? null);
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
        correctionLoginHint: true,
        threads: { 'q-1': doneThread('Bien.') },
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

  describe('AI tutor thread per question', () => {
    it('renders neither a request button nor a thread by default', async () => {
      seed(KEY, { 'q-1': { text: 'x', locked: false, updatedAt: '' } });
      const fixture = await createComponent({ mode: 'solve' });

      expect(el(fixture).querySelector('.exercise-view__correction-request')).toBeNull();
      expect(el(fixture).querySelector('.exercise-view__correction')).toBeNull();
      expect(el(fixture).querySelector('.exercise-view__login-hint')).toBeNull();
    });

    it('invites anonymous students to sign in and emits loginRequested', async () => {
      const fixture = await createComponent({ mode: 'solve', correctionLoginHint: true });
      const login = vi.fn();
      fixture.componentInstance.loginRequested.subscribe(login);

      const hint = el(fixture).querySelector<HTMLElement>('.exercise-view__login-hint');
      expect(hint).not.toBeNull();
      hint!.querySelector('button')!.click();
      expect(login).toHaveBeenCalledTimes(1);
      expect(el(fixture).querySelector('.exercise-view__correction-request')).toBeNull();
    });

    it('offers the request only when enabled and answered, and emits an answer turn', async () => {
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
      expect(requested).toEqual([
        { blockId: 'block-3', questionId: 'q-1', kind: 'answer', content: 'Ma réponse' },
      ]);
    });

    it('renders the turns of a thread with verdict badges, the live turn and the composer', async () => {
      const fixture = await createComponent({
        mode: 'solve',
        correctionEnabled: true,
        threads: {
          'q-1': {
            turns: [
              turn({
                id: 't1',
                content: '5',
                feedback: 'Relis le **cours**.',
                verdict: 'incorrect',
              }),
              turn({ id: 't2', kind: 'message', content: 'Aide', feedback: null, verdict: null }),
            ],
            live: { kind: 'answer', content: '7', text: '' },
            error: null,
            revealedAnswer: null,
          },
        },
      });

      const panel = el(fixture).querySelector('.exercise-view__correction')!;
      const turns = panel.querySelectorAll('.exercise-view__turn');
      expect(turns.length).toBe(3);
      expect(turns[0].querySelector('.exercise-view__student')?.textContent).toContain('5');
      expect(
        turns[0].querySelector('.exercise-view__verdict--incorrect')?.textContent?.trim(),
      ).toBe('Réponse fausse');
      expect(turns[0].querySelector('strong')?.textContent).toBe('cours');
      expect(turns[1].querySelector('.exercise-view__verdict')).toBeNull();
      expect(turns[1].querySelector('.exercise-view__no-feedback')).not.toBeNull();
      // Tour en cours : spinner tant qu'aucun texte, composer et bouton désactivés.
      expect(turns[2].querySelector('app-spinner')).not.toBeNull();
      expect(panel.querySelector<HTMLTextAreaElement>('.exercise-view__reply')?.disabled).toBe(
        true,
      );
      expect(panel.querySelector<HTMLButtonElement>('.exercise-view__send')?.disabled).toBe(true);

      // Texte streamé : rendu en markdown à la place du spinner.
      fixture.componentRef.setInput('threads', {
        'q-1': {
          turns: [],
          live: { kind: 'answer', content: '7', text: 'Presque **bien**' },
          error: null,
          revealedAnswer: null,
        },
      });
      await fixture.whenStable();
      expect(el(fixture).querySelector('.exercise-view__turn--live app-spinner')).toBeNull();
      expect(el(fixture).querySelector('.exercise-view__turn--live strong')?.textContent).toBe(
        'bien',
      );
    });

    it('sends a free message from the composer and clears it', async () => {
      const fixture = await createComponent({
        mode: 'solve',
        correctionEnabled: true,
        threads: { 'q-1': doneThread('Indice.') },
      });
      const requested: CorrectionRequest[] = [];
      fixture.componentInstance.correctionRequested.subscribe((r) => requested.push(r));
      const reply = el(fixture).querySelector<HTMLTextAreaElement>('.exercise-view__reply')!;
      const send = el(fixture).querySelector<HTMLButtonElement>('.exercise-view__send')!;

      expect(send.disabled).toBe(true);
      type(reply, '  Je ne comprends pas  ');
      await fixture.whenStable();
      expect(send.disabled).toBe(false);

      send.click();
      await fixture.whenStable();
      expect(requested).toEqual([
        { blockId: 'block-3', questionId: 'q-1', kind: 'message', content: 'Je ne comprends pas' },
      ]);
      expect(reply.value).toBe('');
    });

    it('shows the revealed answer and the error with a settings link on 429', async () => {
      const fixture = await createComponent({
        mode: 'solve',
        correctionEnabled: true,
        threads: {
          'q-1': {
            ...doneThread('Bravo !', 'correct'),
            error: 429,
            revealedAnswer: 'Limite 0.',
          },
        },
      });

      expect(el(fixture).querySelector('.exercise-view__revealed-answer')?.textContent).toBe(
        'Limite 0.',
      );
      const error = el(fixture).querySelector('.exercise-view__correction-error')!;
      expect(error.textContent).toContain('quota');
      expect(error.querySelector('a')?.getAttribute('href')).toBe('/fr/settings/ai');

      fixture.componentRef.setInput('threads', { 'q-1': { ...doneThread('x'), error: 503 } });
      await fixture.whenStable();
      expect(el(fixture).querySelector('.exercise-view__correction-error a')).toBeNull();
    });

    it('clears one thread or all of them in two steps, disarmed on blur', async () => {
      const fixture = await createComponent({
        mode: 'solve',
        correctionEnabled: true,
        threads: { 'q-1': doneThread('Indice.'), 'q-2': doneThread('Autre.') },
      });
      const requested: ThreadsClearRequest[] = [];
      fixture.componentInstance.threadsClearRequested.subscribe((r) => requested.push(r));
      const threadButton = () =>
        el(fixture).querySelector<HTMLButtonElement>('.exercise-view__clear-thread')!;
      const allButton = () =>
        el(fixture).querySelector<HTMLButtonElement>('.exercise-view__clear-threads')!;

      threadButton().click();
      await fixture.whenStable();
      expect(requested).toEqual([]);
      expect(threadButton().classList.contains('exercise-view__clear--armed')).toBe(true);
      threadButton().dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      expect(threadButton().classList.contains('exercise-view__clear--armed')).toBe(false);

      threadButton().click();
      threadButton().click();
      expect(requested).toEqual([{ blockId: 'block-3', questionId: 'q-1' }]);

      allButton().click();
      allButton().click();
      expect(requested[1]).toEqual({ blockId: 'block-3', questionId: null });
    });

    it('hides the clear buttons while a turn is running or without turns', async () => {
      const fixture = await createComponent({
        mode: 'solve',
        correctionEnabled: true,
        threads: {
          'q-1': { ...doneThread('x'), live: { kind: 'answer', content: '7', text: '' } },
          'q-2': { turns: [], live: null, error: null, revealedAnswer: null },
        },
      });
      expect(el(fixture).querySelector('.exercise-view__clear-thread')).toBeNull();
      // Le bloc a bien un fil persisté (q-1) : le bouton global reste offert.
      expect(el(fixture).querySelector('.exercise-view__clear-threads')).not.toBeNull();
    });

    it('navigates to a cited block through blockLink (guarded by isBlockId)', async () => {
      const blockId = '123e4567-e89b-12d3-a456-426614174000';
      const fixture = await createComponent({
        mode: 'solve',
        correctionEnabled: true,
        blockLink: (id) => ['/', 'fr', 'p', 'courses', 'course-1', 'blocks', id],
        threads: {
          'q-1': doneThread(`Voir [Intro](oc-block:${blockId}) et [Faux](oc-block:pas-un-id).`),
        },
      });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      // Le rendu n'émet une ancre que pour une cible en forme UUID.
      const anchors = el(fixture).querySelectorAll<HTMLElement>('[data-oc-block-id]');
      expect(anchors.length).toBe(1);

      anchors[0].click();
      expect(navigate).toHaveBeenCalledWith([
        '/',
        'fr',
        'p',
        'courses',
        'course-1',
        'blocks',
        blockId,
      ]);

      // Re-garde `isBlockId` : un attribut forgé (HTML brut) ne navigue jamais.
      const forged = document.createElement('span');
      forged.setAttribute('data-oc-block-id', 'pas-un-id');
      el(fixture).querySelector('.exercise-view__correction')!.appendChild(forged);
      forged.click();
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });
});
