import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  COURSE_MODULE_RESOLVER,
  COURSE_RESOURCE_RESOLVER,
} from '../../../core/course-content/course-content-resolvers';
import { PublicCourseDetail } from '../../../core/public-courses/public-course.model';
import { PublicCourseService } from '../../../core/public-courses/public-course.service';
import { QuestionThread } from '../../../core/student/exercise-correction';
import { StudentSubmissionService } from '../../../core/student/student-submission.service';
import {
  PUBLIC_COURSE_DETAIL_FIXTURE,
  PUBLIC_COURSE_RESOURCES_FIXTURE,
} from '../../../testing/public-courses.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StudentBlock } from './student-block';

describe('StudentBlock', () => {
  const detail = signal<PublicCourseDetail | null>(PUBLIC_COURSE_DETAIL_FIXTURE);
  const coursesMock = {
    detail,
    access: signal({ mode: 'public' as const, key: 'course-1' }),
  };
  const resolverMock = {
    list: signal(PUBLIC_COURSE_RESOURCES_FIXTURE),
    listLoading: signal(false),
    ensureList: vi.fn(),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.test/presigned'),
    contentUrl: vi.fn(),
  };

  const authMock = {
    isAuthenticated: signal(false),
    login: vi.fn().mockResolvedValue(undefined),
  };
  const submissionsMock = {
    threads: signal<Record<string, QuestionThread>>({}),
    loading: signal(false),
    loadError: signal(false),
    loadThreads: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue(undefined),
    clearThreads: vi.fn().mockResolvedValue(true),
  };

  const moduleResolverMock = {
    getModule: vi.fn().mockResolvedValue({
      id: 'module-1',
      title: 'Quiz interactif',
      html: '<p>Salut</p>',
      css: '',
      js: '',
      created_at: '',
      updated_at: '',
    }),
  };

  /** paramMap piloté : l'instance survit d'un bloc à l'autre (route réutilisée). */
  let paramMap: BehaviorSubject<ParamMap>;

  async function createComponent(blockId: string): Promise<ComponentFixture<StudentBlock>> {
    paramMap = new BehaviorSubject(convertToParamMap({ blockId }));
    await TestBed.configureTestingModule({
      imports: [StudentBlock, provideTranslocoTesting()],
      providers: [
        // Attrape-tout : les clics sur les liens précédent/suivant naviguent
        // pour de vrai (RouterLink) — sans route correspondante, la promesse
        // de navigation serait rejetée et polluerait la sortie des tests.
        provideRouter([{ path: '**', children: [] }]),
        { provide: PublicCourseService, useValue: coursesMock },
        { provide: COURSE_RESOURCE_RESOLVER, useValue: resolverMock },
        // Requis : le dernier bloc de la fixture est un bloc `module`. Sans lui,
        // ModuleEmbed retomberait sur le résolveur PROF (donc OIDC) — c'est
        // précisément l'invariant que les pages élèves ne doivent jamais violer.
        { provide: COURSE_MODULE_RESOLVER, useValue: moduleResolverMock },
        // Tuteur IA : services root sans rendu de contenu (pas de résolveur prof).
        { provide: AuthService, useValue: authMock },
        { provide: StudentSubmissionService, useValue: submissionsMock },
        {
          provide: ActivatedRoute,
          useValue: { paramMap, snapshot: { paramMap: paramMap.value } },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudentBlock);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<StudentBlock>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function position(fixture: ComponentFixture<StudentBlock>): string | undefined {
    return el(fixture).querySelector('.student-block__position')?.textContent?.trim();
  }

  function footerLinks(fixture: ComponentFixture<StudentBlock>): (string | null)[] {
    return Array.from(
      el(fixture).querySelectorAll<HTMLAnchorElement>('.student-block__nav--footer a'),
    ).map((a) => a.getAttribute('href'));
  }

  beforeEach(() => {
    detail.set(PUBLIC_COURSE_DETAIL_FIXTURE);
    coursesMock.access.set({ mode: 'public', key: 'course-1' });
    authMock.isAuthenticated.set(false);
    submissionsMock.threads.set({});
    vi.clearAllMocks();
  });

  it('renders the requested block alone, with its position', async () => {
    const fixture = await createComponent('block-1');

    expect(el(fixture).querySelectorAll('app-course-blocks-view').length).toBe(1);
    expect(el(fixture).querySelectorAll('.course-preview__block').length).toBe(1);
    expect(position(fixture)).toBe('1 / 4');
  });

  it('solves an exercise block in place: an answer field per question, no CTA, no expected answer', async () => {
    const fixture = await createComponent('block-3');

    expect(el(fixture).querySelectorAll('textarea.exercise-view__answer').length).toBe(1);
    expect(el(fixture).querySelector('.course-preview__exercise-cta')).toBeNull();
    expect(el(fixture).textContent).not.toContain('Décroissante et minorée');
  });

  it('offers only a next link on the first block', async () => {
    const fixture = await createComponent('block-1');

    expect(footerLinks(fixture)).toEqual(['/fr/p/courses/course-1/blocks/block-2']);
  });

  it('offers both neighbours in the middle of the course', async () => {
    const fixture = await createComponent('block-2');

    expect(footerLinks(fixture)).toEqual([
      '/fr/p/courses/course-1/blocks/block-1',
      '/fr/p/courses/course-1/blocks/block-3',
    ]);
  });

  it('offers only a previous link on the last block', async () => {
    const fixture = await createComponent('block-module');

    expect(position(fixture)).toBe('4 / 4');
    expect(footerLinks(fixture)).toEqual(['/fr/p/courses/course-1/blocks/block-3']);
  });

  it('repeats the previous/next links in the top bar', async () => {
    const fixture = await createComponent('block-2');

    const links = Array.from(
      el(fixture).querySelectorAll<HTMLAnchorElement>(
        '.student-block__nav:not(.student-block__nav--footer) a',
      ),
    ).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/fr/p/courses/course-1', // retour au sommaire
      '/fr/p/courses/course-1/blocks/block-1',
      '/fr/p/courses/course-1/blocks/block-3',
    ]);
  });

  it('scrolls back to top when following the next link only', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const fixture = await createComponent('block-2');

    const [previous, next] = Array.from(
      el(fixture).querySelectorAll<HTMLAnchorElement>('.student-block__nav--footer a'),
    );
    previous.click();
    expect(scrollTo).not.toHaveBeenCalled();

    next.click();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    scrollTo.mockRestore();
  });

  it('follows the observed paramMap when the route param changes', async () => {
    // Régression : un snapshot resterait figé sur le premier bloc — la route
    // est réutilisée d'un bloc au suivant, le composant n'est PAS re-monté.
    const fixture = await createComponent('block-1');
    expect(position(fixture)).toBe('1 / 4');

    paramMap.next(convertToParamMap({ blockId: 'block-3' }));
    await fixture.whenStable();

    expect(position(fixture)).toBe('3 / 4');
    // Le bloc 3 est un exercice : la vue de résolution suit le changement de bloc.
    expect(el(fixture).querySelector('textarea.exercise-view__answer')).not.toBeNull();
  });

  it('shows a notice and a way back when the block id is unknown', async () => {
    const fixture = await createComponent('block-inconnu');

    expect(el(fixture).querySelector('.student-block__notice')).not.toBeNull();
    expect(el(fixture).querySelector('app-course-blocks-view')).toBeNull();
    expect(
      el(fixture).querySelector<HTMLAnchorElement>('.student-block__back a')?.getAttribute('href'),
    ).toBe('/fr/p/courses/course-1');
  });

  describe('AI tutor (signed-in students only)', () => {
    it('shows a sign-in hint and never loads threads when anonymous', async () => {
      const fixture = await createComponent('block-3');

      const hint = el(fixture).querySelector<HTMLElement>('.exercise-view__login-hint');
      expect(hint).not.toBeNull();
      expect(el(fixture).querySelector('.exercise-view__correction-request')).toBeNull();
      expect(submissionsMock.loadThreads).not.toHaveBeenCalled();

      hint!.querySelector('button')!.click();
      expect(authMock.login).toHaveBeenCalledWith(TestBed.inject(Router).url);
    });

    it('loads the threads of the exercise block when signed in, and relays a request', async () => {
      authMock.isAuthenticated.set(true);
      const fixture = await createComponent('block-3');

      expect(submissionsMock.loadThreads).toHaveBeenCalledWith('course-1', 'block-3');
      expect(el(fixture).querySelector('.exercise-view__login-hint')).toBeNull();

      const field = el(fixture).querySelector<HTMLTextAreaElement>(
        'textarea.exercise-view__answer',
      )!;
      field.value = 'Ma réponse';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      el(fixture).querySelector<HTMLButtonElement>('.exercise-view__correction-request')!.click();

      expect(submissionsMock.submit).toHaveBeenCalledWith('course-1', {
        blockId: 'block-3',
        questionId: 'q-1',
        kind: 'answer',
        content: 'Ma réponse',
      });
    });

    it('relays a thread clearing to the service', async () => {
      authMock.isAuthenticated.set(true);
      submissionsMock.threads.set({
        'q-1': {
          turns: [
            {
              id: 't1',
              kind: 'answer',
              content: '0',
              feedback: 'Non.',
              verdict: 'incorrect',
              effort: 'insufficient',
              revealed: false,
              created_at: '',
            },
          ],
          live: null,
          error: null,
          revealedAnswer: null,
        },
      });
      const fixture = await createComponent('block-3');
      const button = el(fixture).querySelector<HTMLButtonElement>('.exercise-view__clear-thread')!;
      button.click();
      button.click();
      await fixture.whenStable();

      expect(submissionsMock.clearThreads).toHaveBeenCalledWith('course-1', 'block-3', 'q-1');
    });

    it('does not load threads for a non-exercise block', async () => {
      authMock.isAuthenticated.set(true);
      await createComponent('block-1');

      expect(submissionsMock.loadThreads).not.toHaveBeenCalled();
    });

    it('renders the threads provided by the service', async () => {
      authMock.isAuthenticated.set(true);
      submissionsMock.threads.set({
        'q-1': {
          turns: [
            {
              id: 't1',
              kind: 'answer',
              content: '0',
              feedback: 'Exact.',
              verdict: 'correct',
              effort: 'sufficient',
              revealed: true,
              created_at: '',
            },
          ],
          live: null,
          error: null,
          revealedAnswer: 'Limite 0.',
        },
      });
      const fixture = await createComponent('block-3');

      expect(el(fixture).querySelector('.exercise-view__verdict--correct')).not.toBeNull();
      expect(el(fixture).querySelector('.exercise-view__revealed-answer')?.textContent).toBe(
        'Limite 0.',
      );
    });
  });
});
