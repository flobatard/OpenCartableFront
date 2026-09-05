import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { PublicCourseService } from '../public-courses/public-course.service';
import { StudentSubmissionService } from './student-submission.service';
import { sseResponse } from '../../testing/sse.fixture';

const BASE = 'http://localhost:8000/api/v1/student/courses/course-1/blocks/block-3';
const STREAM = `${BASE}/questions/q-1/submissions/stream`;

const DONE =
  'event: done\ndata: {"submission_id":"s1","verdict":"correct","effort":"sufficient",' +
  '"revealed":true,"expected_answer":"Limite 0.","usage":null}\n\n';

describe('StudentSubmissionService', () => {
  let service: StudentSubmissionService;
  let http: HttpTestingController;
  const isAuthenticated = signal(true);
  const access = signal<{ mode: 'token' | 'public'; key: string } | null>({
    mode: 'public',
    key: 'course-1',
  });

  beforeEach(() => {
    isAuthenticated.set(true);
    access.set({ mode: 'public', key: 'course-1' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated, accessToken: 'jwt-eleve' } },
        { provide: PublicCourseService, useValue: { access } },
      ],
    });
    service = TestBed.inject(StudentSubmissionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    http.verify();
  });

  async function load(): Promise<void> {
    const promise = service.loadThreads('course-1', 'block-3');
    http
      .expectOne((r) => r.url === `${BASE}/submissions`)
      .flush({
        questions: {
          'q-1': {
            turns: [
              {
                id: 't1',
                kind: 'answer',
                content: '5',
                feedback: 'Relis.',
                verdict: 'incorrect',
                effort: 'insufficient',
                revealed: false,
                created_at: '',
              },
            ],
            revealed_answer: null,
          },
        },
      });
    await promise;
  }

  it('loads the threads of a block (Bearer via HttpClient, no token param on public access)', async () => {
    const promise = service.loadThreads('course-1', 'block-3');
    const req = http.expectOne((r) => r.url === `${BASE}/submissions`);
    expect(req.request.params.has('token')).toBe(false);
    req.flush({ questions: { 'q-1': { turns: [], revealed_answer: 'x' } } });
    await promise;

    expect(service.threads()['q-1']).toEqual({
      turns: [],
      live: null,
      error: null,
      revealedAnswer: 'x',
    });
    expect(service.loading()).toBe(false);
  });

  it('passes the share token on token access and flags a load error', async () => {
    access.set({ mode: 'token', key: 'tok' });
    const promise = service.loadThreads('course-1', 'block-3');
    const req = http.expectOne((r) => r.url === `${BASE}/submissions`);
    expect(req.request.params.get('token')).toBe('tok');
    req.flush('nope', { status: 404, statusText: 'Not Found' });
    await promise;

    expect(service.loadError()).toBe(true);
    expect(service.threads()).toEqual({});
  });

  it('streams a turn: live text token by token, then a local turn with the revealed answer', async () => {
    await load();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: token\ndata: {"delta":"Bra"}\n\nevent: tok',
          'en\ndata: {"delta":"vo"}\n\n',
          DONE,
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    await service.submit('course-1', {
      blockId: 'block-3',
      questionId: 'q-1',
      kind: 'answer',
      content: '0',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(STREAM);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-eleve');
    expect(init.body).toBe('{"kind":"answer","content":"0"}');

    const thread = service.threads()['q-1'];
    expect(thread.live).toBeNull();
    expect(thread.turns.length).toBe(2);
    expect(thread.turns[1]).toMatchObject({
      id: 's1',
      kind: 'answer',
      content: '0',
      feedback: 'Bravo',
      verdict: 'correct',
      effort: 'sufficient',
      revealed: true,
    });
    expect(thread.revealedAnswer).toBe('Limite 0.');
    expect(thread.error).toBeNull();
  });

  it('adds the share token to the stream URL on token access', async () => {
    access.set({ mode: 'token', key: 'tok' });
    await load();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([DONE]));
    vi.stubGlobal('fetch', fetchMock);

    await service.submit('course-1', {
      blockId: 'block-3',
      questionId: 'q-1',
      kind: 'message',
      content: 'Aide',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${STREAM}?token=tok`);
  });

  it('records the status of a non-2xx response and keeps the student turn without feedback', async () => {
    await load();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota', { status: 429 })));

    await service.submit('course-1', {
      blockId: 'block-3',
      questionId: 'q-1',
      kind: 'answer',
      content: '7',
    });

    const thread = service.threads()['q-1'];
    expect(thread.error).toBe(429);
    expect(thread.live).toBeNull();
    expect(thread.turns[1]).toMatchObject({ content: '7', feedback: null, verdict: null });
  });

  it('turns an error event into a partial turn with the status', async () => {
    await load();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'event: token\ndata: {"delta":"Début"}\n\n',
            'event: error\ndata: {"status":503,"detail":"Injoignable"}\n\n',
          ]),
        ),
    );

    await service.submit('course-1', {
      blockId: 'block-3',
      questionId: 'q-1',
      kind: 'answer',
      content: '7',
    });

    const thread = service.threads()['q-1'];
    expect(thread.error).toBe(503);
    expect(thread.turns[1]).toMatchObject({ feedback: 'Début', verdict: null });
  });

  it('ignores a submit for another block than the loaded one', async () => {
    await load();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await service.submit('course-1', {
      blockId: 'block-9',
      questionId: 'q-1',
      kind: 'answer',
      content: '7',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears one thread server-side then locally', async () => {
    await load();
    const promise = service.clearThreads('course-1', 'block-3', 'q-1');
    const req = http.expectOne((r) => r.url === `${BASE}/submissions`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.params.get('question_id')).toBe('q-1');
    req.flush({ deleted: 1 });

    expect(await promise).toBe(true);
    expect(service.threads()).toEqual({});
  });

  it('clears the whole block and reports failures', async () => {
    access.set({ mode: 'token', key: 'tok' });
    await load();
    let promise = service.clearThreads('course-1', 'block-3', null);
    let req = http.expectOne((r) => r.url === `${BASE}/submissions`);
    expect(req.request.params.get('token')).toBe('tok');
    expect(req.request.params.has('question_id')).toBe(false);
    req.flush('nope', { status: 404, statusText: 'Not Found' });
    expect(await promise).toBe(false);
    expect(Object.keys(service.threads())).toEqual(['q-1']);

    promise = service.clearThreads('course-1', 'block-3', null);
    req = http.expectOne((r) => r.url === `${BASE}/submissions`);
    req.flush({ deleted: 1 });
    expect(await promise).toBe(true);
    expect(service.threads()).toEqual({});
  });

  it('purges everything when the session closes', async () => {
    await load();
    expect(Object.keys(service.threads())).toEqual(['q-1']);

    isAuthenticated.set(false);
    TestBed.tick();

    expect(service.threads()).toEqual({});
  });
});
