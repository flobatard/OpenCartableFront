import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthService } from '../auth/auth.service';
import { AssistantConversation, AssistantConversationDetail } from './assistant.model';
import { CourseAssistantService } from './course-assistant.service';
import { sseResponse } from '../../testing/sse.fixture';

const BASE = `${environment.apiUrl}/v1/courses/c1/assistant/conversations`;

const CONVERSATION: AssistantConversation = {
  id: 'conv-1',
  context: 'course',
  block_id: null,
  module_id: null,
  title: null,
  created_at: '2026-08-31T10:00:00Z',
  updated_at: '2026-08-31T10:00:00Z',
};

const DETAIL: AssistantConversationDetail = { ...CONVERSATION, messages: [] };

describe('CourseAssistantService', () => {
  let service: CourseAssistantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => true, accessToken: 'jwt-token' },
        },
      ],
    });
    service = TestBed.inject(CourseAssistantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadList(): Promise<void> {
    const promise = service.loadConversations('c1');
    http.expectOne(BASE).flush([CONVERSATION]);
    await promise;
  }

  async function openConversation(): Promise<void> {
    const promise = service.openConversation('conv-1');
    http.expectOne(`${BASE}/conv-1`).flush(DETAIL);
    await promise;
  }

  it('loads the conversation list of a course', async () => {
    await loadList();
    expect(service.conversations()).toEqual([CONVERSATION]);
    expect(service.listError()).toBe(false);
  });

  it('starts on an empty draft conversation (nothing created server-side)', async () => {
    await loadList();
    expect(service.active()?.id).toBe('');
    expect(service.active()?.messages).toEqual([]);
    // Aucun POST : le brouillon est purement local.
    http.verify();
  });

  it('startNewConversation resets to a fresh local draft without any request', async () => {
    await loadList();
    await openConversation();
    expect(service.active()?.id).toBe('conv-1');

    service.startNewConversation();

    expect(service.active()?.id).toBe('');
    expect(service.active()?.messages).toEqual([]);
    http.verify();
  });

  it('flags a list load failure and allows retry', async () => {
    const promise = service.loadConversations('c1');
    http.expectOne(BASE).flush('boom', { status: 503, statusText: 'Unavailable' });
    await promise;
    expect(service.listError()).toBe(true);
    expect(service.conversations()).toBeNull();
  });

  it('materializes the draft server-side on the first message, then streams', async () => {
    await loadList();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: token\ndata: {"delta":"Réponse"}\n\n',
          'event: done\ndata: {"usage":null,"user_message_id":"u1","message_ids":["m1"],' +
            '"sources":{},"title":"Premier échange"}\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = service.sendMessage('Bonjour');
    const req = http.expectOne(BASE);
    expect(req.request.body).toEqual({ context: 'course' });
    req.flush({ ...CONVERSATION, id: 'conv-2' });
    await promise;

    // Le flux vise la conversation créée, le message local est conservé.
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/conv-2/messages/stream`);
    expect(service.active()?.id).toBe('conv-2');
    expect(service.active()?.messages[0].content).toBe('Bonjour');
    expect(service.conversations()?.[0].id).toBe('conv-2');
    expect(service.conversations()?.length).toBe(2);
  });

  it('maps a failed draft creation to the error state, keeping the local message', async () => {
    await loadList();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const promise = service.sendMessage('Bonjour');
    http.expectOne(BASE).flush('boom', { status: 503, statusText: 'Unavailable' });
    await promise;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.streamState()).toBe('error');
    expect(service.streamErrorStatus()).toBe(503);
    expect(service.active()?.id).toBe('');
    expect(service.active()?.messages[0].content).toBe('Bonjour');
  });

  it('deletes a conversation and closes it if active', async () => {
    await loadList();
    await openConversation();
    const promise = service.deleteConversation('conv-1');
    http.expectOne(`${BASE}/conv-1`).flush(null, { status: 204, statusText: 'No Content' });
    await promise;
    expect(service.conversations()).toEqual([]);
    expect(service.active()).toBeNull();
  });

  it('streams a turn: Bearer manuel, deltas, outils, done', async () => {
    await loadList();
    await openConversation();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: thinking\ndata: {"delta":"hmm"}\n\n' + 'event: tok',
          'en\ndata: {"delta":"Voici "}\n\n',
          'event: tool_call\ndata: {"id":"c1","name":"read_block","args":{"block_id":"b1"}}\n\n',
          'event: tool_result\ndata: {"id":"c1","name":"read_block","is_error":false,' +
            '"excerpt":"### Bloc 1","length":5000}\n\n',
          'event: token\ndata: {"delta":"la synthèse"}\n\n',
          'event: done\ndata: {"usage":{"input_tokens":3,"output_tokens":2},' +
            '"user_message_id":"u1","message_ids":["m1"],' +
            '"sources":{"blocks":["11111111-1111-4111-8111-111111111111"]},"title":"Ma question"}\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    await service.sendMessage('Ma question');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/conv-1/messages/stream`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-token');
    expect(init.body).toBe(JSON.stringify({ content: 'Ma question' }));

    expect(service.streamState()).toBe('idle');
    const messages = service.active()!.messages;
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Ma question');
    const assistant = messages[messages.length - 1];
    expect(assistant.role).toBe('assistant');
    expect(assistant.content).toBe('Voici la synthèse');
    expect(assistant.sources).toEqual({ blocks: ['11111111-1111-4111-8111-111111111111'] });
    expect(assistant.tool_calls).toEqual([
      { id: 'c1', name: 'read_block', arguments: { block_id: 'b1' } },
    ]);
    // L'usage de `done` est posé sur le message assistant replié (même forme
    // que la ligne persistée, le fil affiche les tokens du tour) ; sans détail
    // de cache relayé, la part en cache vaut null.
    expect(assistant.input_tokens).toBe(3);
    expect(assistant.output_tokens).toBe(2);
    expect(assistant.cached_input_tokens).toBeNull();
    // Le tour tool local porte l'extrait streamé (tronqué : « … »), apparié à l'appel.
    const toolRow = messages[messages.length - 2];
    expect(toolRow.role).toBe('tool');
    expect(toolRow.tool_call_id).toBe('c1');
    expect(toolRow.content).toBe('### Bloc 1…');
    expect(toolRow.is_error).toBe(false);
    // Le titre posé par le back remonte dans la liste sans refetch.
    expect(service.conversations()?.[0].title).toBe('Ma question');
    // Fin de tour : plus rien en cours.
    expect(service.streamingText()).toBe('');
    expect(service.streamingThinking()).toBe('');
  });

  it('maps a non-2xx response to the error state (429 quota)', async () => {
    await loadList();
    await openConversation();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Quota' }), { status: 429 })),
    );

    await service.sendMessage('Encore');

    expect(service.streamState()).toBe('error');
    expect(service.streamErrorStatus()).toBe(429);
  });

  it('keeps the partial text on a mid-stream error event', async () => {
    await loadList();
    await openConversation();
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

    await service.sendMessage('Question');

    expect(service.streamState()).toBe('error');
    expect(service.streamErrorStatus()).toBe(503);
    const messages = service.active()!.messages;
    expect(messages[messages.length - 1].role).toBe('assistant');
    expect(messages[messages.length - 1].content).toBe('Début');
  });
});

/**
 * Questions de l'assistant (tool `ask_questions`) dans le contexte global :
 * interrupt → formulaire, réponse ou refus par la route de réponse,
 * reproposition à la réouverture, expiration (404), panneau révélé.
 */
describe('CourseAssistantService — questions de l’assistant', () => {
  let service: CourseAssistantService;
  let http: HttpTestingController;

  const ASK_ARGS =
    '{"questions":[{"question":"Quel niveau ?","multi_select":false,' +
    '"options":[{"label":"Seconde"},{"label":"Première"}]},' +
    '{"question":"Quelles notions ?","multi_select":true,' +
    '"options":[{"label":"Dérivée"},{"label":"Limites"}]}]}';

  const QUESTIONS_EVENTS =
    'event: token\ndata: {"delta":"Quelques précisions. "}\n\n' +
    `event: tool_call\ndata: {"id":"call_q","name":"ask_questions","args":${ASK_ARGS}}\n\n` +
    'event: interrupt\ndata: {"tool_call_id":"call_q","kind":"questions","message_ids":["m1"],' +
    '"usage":{"input_tokens":50,"output_tokens":20}}\n\n';

  const ANSWERED_EVENTS = [
    'event: tool_result\ndata: {"id":"call_q","name":"ask_questions","is_error":false,' +
      '"excerpt":"Le professeur a répondu à vos questions :","length":42}\n\n',
    'event: token\ndata: {"delta":"Merci."}\n\n',
    'event: done\ndata: {"usage":{"input_tokens":30,"output_tokens":10},' +
      '"user_message_id":null,"message_ids":["m2","m3"],"sources":{},"title":null}\n\n',
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => true, accessToken: 'jwt-token' },
        },
      ],
    });
    service = TestBed.inject(CourseAssistantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function open(detail: AssistantConversationDetail): Promise<void> {
    const list = service.loadConversations('c1');
    http.expectOne(BASE).flush([CONVERSATION]);
    await list;
    const promise = service.openConversation('conv-1');
    http.expectOne(`${BASE}/conv-1`).flush(detail);
    await promise;
  }

  /** Conversation ouverte, tour envoyé, le flux se ferme sur les questions. */
  async function reachQuestions(): Promise<void> {
    await open(DETAIL);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([QUESTIONS_EVENTS])));
    await service.sendMessage('Crée un exercice');
  }

  it('an interrupt on ask_questions sets pendingQuestions, never pendingProposal', async () => {
    await reachQuestions();
    expect(service.streamState()).toBe('awaiting');
    expect(service.pendingProposal()).toBeNull();
    expect(service.pendingQuestions()).toEqual({
      id: 'call_q',
      reoffered: false,
      questions: [
        {
          text: 'Quel niveau ?',
          multiSelect: false,
          options: [
            { label: 'Seconde', description: null },
            { label: 'Première', description: null },
          ],
        },
        {
          text: 'Quelles notions ?',
          multiSelect: true,
          options: [
            { label: 'Dérivée', description: null },
            { label: 'Limites', description: null },
          ],
        },
      ],
    });
    // Le tour reste affiché en l'état, l'appel en cours.
    expect(service.toolActivity().map((entry) => [entry.id, entry.status])).toEqual([
      ['call_q', 'running'],
    ]);
  });

  it('new pending questions unfold the floating panel', async () => {
    expect(service.panelOpen()).toBe(false);
    await reachQuestions();
    TestBed.tick();
    expect(service.panelOpen()).toBe(true);
    // Replié ensuite par le professeur : la même série ne le rouvre pas.
    service.setPanelOpen(false);
    TestBed.tick();
    expect(service.panelOpen()).toBe(false);
  });

  it('answerQuestions posts to the answer route and consumes the questions on open', async () => {
    await reachQuestions();
    const answerFetch = vi.fn().mockResolvedValue(sseResponse(ANSWERED_EVENTS));
    vi.stubGlobal('fetch', answerFetch);
    const answers = [
      { selected: [1], other: null },
      { selected: [0], other: 'Tangentes' },
    ];

    await expect(service.answerQuestions({ declined: false, answers })).resolves.toBe(true);

    const [url, init] = answerFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/conv-1/questions/call_q/answer`);
    expect(JSON.parse(init.body as string)).toEqual({ declined: false, answers });
    expect(service.pendingQuestions()).toBeNull();
    expect(service.streamState()).toBe('idle');
    // Tour replié en un message assistant : appel apparié à son résultat,
    // usage de l'interrupt (50/20) + reprise (30/10).
    const messages = service.active()!.messages;
    const folded = messages.at(-1)!;
    expect(folded.tool_calls.map((call) => call.id)).toEqual(['call_q']);
    // Le texte de la reprise forme un paragraphe distinct (segment à part côté back).
    expect(folded.content).toBe('Quelques précisions.\n\nMerci.');
    expect(folded.input_tokens).toBe(80);
    expect(messages.find((m) => m.role === 'tool')?.tool_call_id).toBe('call_q');
  });

  it('declining posts {declined: true, answers: null}', async () => {
    await reachQuestions();
    const capture = vi.spyOn(TestBed.inject(AnalyticsService), 'capture');
    const answerFetch = vi.fn().mockResolvedValue(sseResponse(ANSWERED_EVENTS));
    vi.stubGlobal('fetch', answerFetch);

    await service.answerQuestions({ declined: true });

    const [, init] = answerFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ declined: true, answers: null });
    expect(capture).toHaveBeenCalledWith('assistant_questions_answered', {
      questions: 2,
      declined: true,
      other: 0,
      reoffered: false,
    });
  });

  it('analytics count answers, never their text', async () => {
    await reachQuestions();
    const capture = vi.spyOn(TestBed.inject(AnalyticsService), 'capture');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(ANSWERED_EVENTS)));
    await service.answerQuestions({
      declined: false,
      answers: [
        { selected: [], other: 'Terminale' },
        { selected: [0, 1], other: null },
      ],
    });
    expect(capture).toHaveBeenCalledWith('assistant_questions_answered', {
      questions: 2,
      declined: false,
      other: 1,
      reoffered: false,
    });
  });

  it('a failed answer keeps the questions retryable', async () => {
    await reachQuestions();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })));
    await expect(service.answerQuestions({ declined: true })).resolves.toBe(false);
    expect(service.pendingQuestions()?.id).toBe('call_q');
    expect(service.streamState()).toBe('error');
    expect(service.questionsExpired()).toBe(false);
  });

  it('a 404 drops the questions, flags them expired and gives the composer back', async () => {
    await reachQuestions();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 404 })));
    await expect(service.answerQuestions({ declined: true })).resolves.toBe(false);
    expect(service.pendingQuestions()).toBeNull();
    expect(service.questionsExpired()).toBe(true);
    expect(service.streamState()).toBe('idle');
    expect(service.streamErrorStatus()).toBeNull();
  });

  function reloadedDetail(): AssistantConversationDetail {
    return {
      ...DETAIL,
      messages: [
        {
          id: 'm0',
          role: 'user',
          position: 0,
          content: 'Crée un exercice',
          tool_calls: [],
          tool_call_id: null,
          is_error: false,
          sources: {},
          input_tokens: null,
          output_tokens: null,
          cached_input_tokens: null,
          created_at: '2026-09-13T10:00:00Z',
        },
        {
          id: 'm1',
          role: 'assistant',
          position: 1,
          content: 'Quelques précisions. ',
          tool_calls: [{ id: 'call_q', name: 'ask_questions', arguments: JSON.parse(ASK_ARGS) }],
          tool_call_id: null,
          is_error: false,
          sources: {},
          input_tokens: 50,
          output_tokens: 20,
          cached_input_tokens: null,
          created_at: '2026-09-13T10:00:00Z',
        },
      ],
    };
  }

  it('openConversation re-offers the questions still ending the conversation', async () => {
    await open(reloadedDetail());
    expect(service.streamState()).toBe('awaiting');
    expect(service.pendingQuestions()?.id).toBe('call_q');
    expect(service.pendingQuestions()?.reoffered).toBe(true);
    expect(service.pendingQuestions()?.questions).toHaveLength(2);
  });

  it('answering re-offered questions pairs the persisted call with a local tool row', async () => {
    await open(reloadedDetail());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(ANSWERED_EVENTS)));

    await service.answerQuestions({ declined: true });

    const messages = service.active()!.messages;
    expect(messages.map((m) => [m.role, m.tool_call_id])).toEqual([
      ['user', null],
      ['assistant', null],
      ['tool', 'call_q'],
      ['assistant', null],
    ]);
    // Le repli ne duplique pas l'appel persisté : le nouveau segment n'a que du texte.
    expect(messages.at(-1)?.tool_calls).toEqual([]);
    expect(messages.at(-1)?.content).toBe('Merci.');
  });

  it('expired questions are not re-offered again by the same instance', async () => {
    await open(reloadedDetail());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 404 })));
    await service.answerQuestions({ declined: true });

    const promise = service.openConversation('conv-1');
    http.expectOne(`${BASE}/conv-1`).flush(reloadedDetail());
    await promise;
    expect(service.pendingQuestions()).toBeNull();
    expect(service.streamState()).toBe('idle');
  });

  it('sending a new message abandons the questions locally', async () => {
    await reachQuestions();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(['event: token\ndata: {"delta":"Entendu."}\n\n'])),
    );
    await service.sendMessage('Laisse tomber');
    expect(service.pendingQuestions()).toBeNull();
  });
});
