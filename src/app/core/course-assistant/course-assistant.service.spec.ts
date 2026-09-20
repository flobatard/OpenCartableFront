import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthService } from '../auth/auth.service';
import { CourseDetail } from '../courses/course.model';
import { ModuleDetail } from '../modules/module.model';
import { AssistantConversation, AssistantConversationDetail } from './assistant.model';
import { CourseAssistantService } from './course-assistant.service';
import { GlobalEditService } from './global-edit.service';
import { ProposalModeService } from './proposal-mode.service';
import { AssistantPendingProposal } from './proposals';
import { TargetApplierRegistry } from './target-applier.registry';
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

/**
 * Édition globale : `allow_edit` envoyé avec le message, délégation à un
 * sous-assistant (cible préchargée dès l'appel `edit_*`), revue globale de
 * sa proposition et application SUR LA CIBLE — via l'éditeur monté, sinon
 * par un PATCH headless — avant la reprise du run.
 */
describe('CourseAssistantService — édition globale', () => {
  let service: CourseAssistantService;
  let http: HttpTestingController;

  const BLOCK = '11111111-1111-4111-8111-111111111111';
  const MODULE = '22222222-2222-4222-8222-222222222222';
  const COURSE_URL = `${environment.apiUrl}/v1/courses/c1`;

  const DELEGATION_EVENTS =
    'event: token\ndata: {"delta":"Je délègue. "}\n\n' +
    'event: tool_call\ndata: {"id":"call_d","name":"edit_block","args":{"target_ref":"B1",' +
    `"instructions":"Réécris.","block_id":"${BLOCK}","context":"block_text","target_title":"Intro"}}\n\n` +
    'event: token\ndata: {"delta":"Je lis. ","agent":"call_d"}\n\n' +
    'event: tool_call\ndata: {"id":"call_r","name":"read_block","args":{"block_ref":"B1"},' +
    '"agent":"call_d"}\n\n' +
    'event: tool_result\ndata: {"id":"call_r","name":"read_block","is_error":false,' +
    '"excerpt":"# V1","length":4,"agent":"call_d"}\n\n' +
    'event: tool_call\ndata: {"id":"call_c","name":"propose_block_edit",' +
    '"args":{"new_markdown":"# V2","summary":"Réécriture"},"agent":"call_d"}\n\n' +
    'event: interrupt\ndata: {"tool_call_id":"call_c","kind":"proposal","agent":"call_d",' +
    '"message_ids":["m1"],"usage":{"input_tokens":50,"output_tokens":20}}\n\n';

  const MODULE_DELEGATION_EVENTS =
    'event: tool_call\ndata: {"id":"call_d","name":"edit_module","args":{"target_ref":"M1",' +
    `"instructions":"Un bouton.","module_id":"${MODULE}","context":"module","target_title":"Compteur"}}\n\n` +
    'event: tool_call\ndata: {"id":"call_c","name":"propose_js_edit",' +
    '"args":{"new_code":"new","summary":"JS"},"agent":"call_d"}\n\n' +
    'event: interrupt\ndata: {"tool_call_id":"call_c","kind":"proposal","agent":"call_d",' +
    '"message_ids":["m1"]}\n\n';

  const RESUMED_EVENTS = [
    'event: tool_result\ndata: {"id":"call_c","name":"propose_block_edit","is_error":false,' +
      '"excerpt":"ACCEPTÉ","length":7,"agent":"call_d"}\n\n',
    'event: token\ndata: {"delta":"Fait.","agent":"call_d"}\n\n',
    'event: tool_result\ndata: {"id":"call_d","name":"edit_block","is_error":false,' +
      '"excerpt":"Sous-assistant terminé.","length":23}\n\n',
    'event: token\ndata: {"delta":"Parfait."}\n\n',
    'event: done\ndata: {"usage":{"input_tokens":30,"output_tokens":10},"user_message_id":null,' +
      '"message_ids":["m2","m3"],"sources":{},"title":null}\n\n',
  ];

  function courseDetail(markdown = '# V1'): CourseDetail {
    return {
      id: 'c1',
      title: 'Géométrie',
      description: null,
      subject_ids: [],
      education_level_ids: [],
      block_count: 1,
      visibility: 'draft',
      created_at: '2026-09-17T10:00:00Z',
      updated_at: '2026-09-17T10:00:00Z',
      blocks: [
        {
          id: BLOCK,
          position: 0,
          type: 'text',
          title: 'Intro',
          description: null,
          content: { markdown },
          resource_id: null,
          module_id: null,
        },
      ],
    };
  }

  function moduleDetail(js = 'old'): ModuleDetail {
    return {
      id: MODULE,
      title: 'Compteur',
      html: '<b></b>',
      css: '',
      js,
      created_at: '2026-09-17T10:00:00Z',
      updated_at: '2026-09-17T10:00:00Z',
    };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    TestBed.inject(GlobalEditService).setEnabled(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('oc-assistant-global-edit');
    localStorage.removeItem('oc-assistant-proposal-mode');
  });

  async function open(): Promise<void> {
    const list = service.loadConversations('c1');
    http.expectOne(BASE).flush([CONVERSATION]);
    await list;
    const promise = service.openConversation('conv-1');
    http.expectOne(`${BASE}/conv-1`).flush(DETAIL);
    await promise;
  }

  /** Tour envoyé : délégation puis proposition du sous-assistant ; cible préchargée. */
  async function reachProposal(events = DELEGATION_EVENTS): Promise<void> {
    await open();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([events])));
    await service.sendMessage('Améliore l’intro');
    TestBed.tick(); // préchargement de la cible (effect sur l'activité d'outils)
  }

  async function loadBlockTarget(markdown = '# V1'): Promise<void> {
    http.expectOne(COURSE_URL).flush(courseDetail(markdown));
    await settle();
    TestBed.tick();
  }

  it('sends allow_edit with the message when global editing is on', async () => {
    await open();
    const capture = vi.spyOn(TestBed.inject(AnalyticsService), 'capture');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(['event: token\ndata: {"delta":"Ok"}\n\n']));
    vi.stubGlobal('fetch', fetchMock);

    await service.sendMessage('Améliore');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ content: 'Améliore', allow_edit: true }));
    expect(capture).toHaveBeenCalledWith('assistant_message_sent', {
      context: 'course',
      allowEdit: true,
    });
  });

  it('a sub-assistant proposal carries its delegation; the review builds once the target is loaded', async () => {
    await reachProposal();
    expect(service.pendingProposal()).toMatchObject({
      kind: 'block_text',
      id: 'call_c',
      delegation: { id: 'call_d', context: 'block_text', targetId: BLOCK, targetTitle: 'Intro' },
    });
    // Le texte du sous-assistant reste sur sa carte, jamais dans le texte de l'assistant.
    expect(service.streamingText()).toBe('Je délègue. ');
    expect(service.toolActivity()[0].agentText).toBe('Je lis. ');
    // Cible pas encore chargée : rien à revoir, la fenêtre reste fermée.
    expect(service.proposals.review()).toBeNull();
    expect(service.reviewVisible()).toBe(false);

    await loadBlockTarget();
    expect(service.proposals.review()).toEqual({
      kind: 'text',
      proposal: service.pendingProposal(),
      original: '# V1',
      targetTitle: 'Intro',
    });
    expect(service.reviewVisible()).toBe(true);
    expect(service.panelOpen()).toBe(true);

    // Refermée sans décider, puis rouverte par « Revoir ».
    service.hideReview();
    expect(service.reviewVisible()).toBe(false);
    service.showReview();
    expect(service.reviewVisible()).toBe(true);
  });

  it('accepting applies headless (PATCH of the block) before the decision, then resumes', async () => {
    await reachProposal();
    await loadBlockTarget();
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse(RESUMED_EVENTS));
    vi.stubGlobal('fetch', resumeFetch);

    const accepted = service.proposals.accept('Bien');
    await settle();
    const patch = http.expectOne(`${COURSE_URL}/blocks/${BLOCK}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ content: { markdown: '# V2' } });
    // Rien n'est envoyé au back tant que la cible n'est pas modifiée.
    expect(resumeFetch).not.toHaveBeenCalled();
    patch.flush(courseDetail('# V2').blocks[0]);
    await accepted;

    const [url, init] = resumeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/conv-1/proposals/call_c/decision`);
    expect(JSON.parse(init.body as string)).toEqual({ accepted: true, comment: 'Bien' });
    expect(service.pendingProposal()).toBeNull();
    TestBed.tick(); // la fenêtre suit la revue (effect)
    expect(service.reviewVisible()).toBe(false);
    expect(service.streamState()).toBe('idle');
    expect(service.proposals.error()).toBeNull();

    // Tour replié : seul l'appel edit_block et son compte rendu (l'activité
    // du sous-assistant n'est jamais persistée) ; le texte de l'assistant
    // après le compte rendu forme un paragraphe distinct.
    const messages = service.active()!.messages;
    const folded = messages.at(-1)!;
    expect(folded.tool_calls.map((call) => call.id)).toEqual(['call_d']);
    expect(folded.content).toBe('Je délègue.\n\nParfait.');
    expect(messages.find((m) => m.role === 'tool')?.content).toBe('Sous-assistant terminé.');
  });

  it('an editor mounted on the target applies through it and flushes before the decision', async () => {
    await reachProposal();
    await loadBlockTarget();
    const applier = {
      apply: vi.fn((_proposal: AssistantPendingProposal) => true),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.inject(TargetApplierRegistry).register(BLOCK, applier);
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse(RESUMED_EVENTS));
    vi.stubGlobal('fetch', resumeFetch);

    await service.proposals.accept('');

    http.expectNone(`${COURSE_URL}/blocks/${BLOCK}`);
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect(applier.apply.mock.calls[0][0]).toMatchObject({ kind: 'block_text', id: 'call_c' });
    expect(applier.flush).toHaveBeenCalledTimes(1);
    expect(resumeFetch).toHaveBeenCalledTimes(1);
  });

  it('a refused PATCH reports `apply`, sends nothing and keeps the review', async () => {
    await reachProposal();
    await loadBlockTarget();
    const resumeFetch = vi.fn();
    vi.stubGlobal('fetch', resumeFetch);

    const accepted = service.proposals.accept('');
    await settle();
    http
      .expectOne(`${COURSE_URL}/blocks/${BLOCK}`)
      .flush('boom', { status: 503, statusText: 'Unavailable' });
    await accepted;

    expect(resumeFetch).not.toHaveBeenCalled();
    expect(service.proposals.error()).toBe('apply');
    expect(service.pendingProposal()?.id).toBe('call_c');
    expect(service.proposals.review()?.kind).toBe('text');
  });

  it('auto mode waits for the target in flight, freezes the original, applies and accepts', async () => {
    TestBed.inject(ProposalModeService).setMode('auto');
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse(RESUMED_EVENTS));
    await open();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(sseResponse([DELEGATION_EVENTS])).mockImplementation(resumeFetch),
    );
    await service.sendMessage('Améliore l’intro');
    TestBed.tick(); // préchargement + acceptation automatique (en attente de la cible)
    expect(service.reviewVisible()).toBe(false);

    http.expectOne(COURSE_URL).flush(courseDetail('# V1'));
    await settle();
    const patch = http.expectOne(`${COURSE_URL}/blocks/${BLOCK}`);
    expect(patch.request.body).toEqual({ content: { markdown: '# V2' } });
    patch.flush(courseDetail('# V2').blocks[0]);
    await settle();
    await settle();
    TestBed.tick();

    expect(resumeFetch).toHaveBeenCalledTimes(1);
    const [, init] = resumeFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ accepted: true, comment: null });
    expect(service.pendingProposal()).toBeNull();
    // Jamais de fenêtre de revue en mode auto.
    expect(service.reviewVisible()).toBe(false);
  });

  it('a module delegation preloads the module and reviews the targeted file', async () => {
    await reachProposal(MODULE_DELEGATION_EVENTS);
    http.expectOne(`${COURSE_URL}/modules/${MODULE}`).flush(moduleDetail('old'));
    await settle();
    TestBed.tick();
    expect(service.proposals.review()).toEqual({
      kind: 'module',
      proposal: service.pendingProposal(),
      original: 'old',
      targetTitle: 'Compteur',
    });

    const resumeFetch = vi.fn().mockResolvedValue(
      sseResponse([
        'event: done\ndata: {"usage":null,"user_message_id":null,"message_ids":[],' +
          '"sources":{},"title":null}\n\n',
      ]),
    );
    vi.stubGlobal('fetch', resumeFetch);
    const accepted = service.proposals.accept('');
    await settle();
    const patch = http.expectOne(`${COURSE_URL}/modules/${MODULE}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ js: 'new' });
    patch.flush(moduleDetail('new'));
    await accepted;
    expect(resumeFetch).toHaveBeenCalledTimes(1);
  });

  it('changing course drops the loaded targets and frozen reviews', async () => {
    await reachProposal();
    await loadBlockTarget();
    expect(service.proposals.review()).not.toBeNull();

    const list = service.loadConversations('c2');
    http.expectOne(`${environment.apiUrl}/v1/courses/c2/assistant/conversations`).flush([]);
    await list;
    expect(service.pendingProposal()).toBeNull();
    expect(service.proposals.review()).toBeNull();
  });
});

describe('CourseAssistantService — propositions structurelles', () => {
  let service: CourseAssistantService;
  let http: HttpTestingController;

  const B1 = '11111111-1111-4111-8111-111111111111';
  const B2 = '22222222-2222-4222-8222-222222222222';
  const NEW = '33333333-3333-4333-8333-333333333333';
  const RESOURCE = '44444444-4444-4444-8444-444444444444';
  const COURSE_URL = `${environment.apiUrl}/v1/courses/c1`;

  function proposes(name: string, args: Record<string, unknown>): string {
    return (
      'event: token\ndata: {"delta":"Je vous le propose. "}\n\n' +
      `event: tool_call\ndata: ${JSON.stringify({ id: 'call_s', name, args })}\n\n` +
      'event: interrupt\ndata: {"tool_call_id":"call_s","kind":"proposal","message_ids":["m1"]}\n\n'
    );
  }

  const ADD_EVENTS = proposes('propose_block_add', {
    type: 'document',
    title: 'Fiche',
    after_ref: 'B1',
    resource_ref: 'R1',
    summary: 'Ajout',
    after_id: B1,
    resource_id: RESOURCE,
    resource_name: 'fiche.pdf',
    module_id: null,
    module_title: null,
  });
  const DELETE_EVENTS = proposes('propose_block_delete', {
    target_ref: 'B2',
    summary: 'Retrait',
    block_id: B2,
    target_title: 'Bilan',
  });
  const REORDER_EVENTS = proposes('propose_blocks_reorder', {
    order: ['B2', 'B1'],
    summary: 'Ordre',
    block_ids: [B2, B1],
  });

  function resumed(name: string): string[] {
    return [
      `event: tool_result\ndata: {"id":"call_s","name":"${name}","is_error":false,` +
        '"excerpt":"ACCEPTÉ","length":7}\n\n',
      'event: done\ndata: {"usage":null,"user_message_id":null,"message_ids":["m2"],' +
        '"sources":{},"title":null}\n\n',
    ];
  }

  function block(id: string, title: string, position: number): CourseDetail['blocks'][number] {
    return {
      id,
      position,
      type: 'text',
      title,
      description: null,
      content: { markdown: '' },
      resource_id: null,
      module_id: null,
    };
  }

  function courseDetail(): CourseDetail {
    return {
      id: 'c1',
      title: 'Géométrie',
      description: null,
      subject_ids: [],
      education_level_ids: [],
      block_count: 2,
      visibility: 'draft',
      created_at: '2026-09-17T10:00:00Z',
      updated_at: '2026-09-17T10:00:00Z',
      blocks: [block(B1, 'Intro', 0), block(B2, 'Bilan', 1)],
    };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    TestBed.inject(GlobalEditService).setEnabled(true);
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    localStorage.removeItem('oc-assistant-global-edit');
    localStorage.removeItem('oc-assistant-proposal-mode');
  });

  /** Tour envoyé jusqu'à la proposition ; le cours (page non chargée) est lu par un GET muet. */
  async function reachProposal(events: string): Promise<void> {
    const list = service.loadConversations('c1');
    http.expectOne(BASE).flush([CONVERSATION]);
    await list;
    const opened = service.openConversation('conv-1');
    http.expectOne(`${BASE}/conv-1`).flush(DETAIL);
    await opened;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([events])));
    await service.sendMessage('Réorganise');
    TestBed.tick();
    http.expectOne(COURSE_URL).flush(courseDetail());
    await settle();
    TestBed.tick();
  }

  function decisionBody(resumeFetch: ReturnType<typeof vi.fn>): unknown {
    const [url, init] = resumeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/conv-1/proposals/call_s/decision`);
    return JSON.parse(init.body as string);
  }

  it('reviews a structure proposal on the current blocks, without any delegation', async () => {
    await reachProposal(REORDER_EVENTS);
    expect(service.pendingProposal()).toMatchObject({ kind: 'blocks_reorder', id: 'call_s' });
    expect(service.pendingProposal()?.delegation).toBeUndefined();
    const review = service.proposals.review();
    expect(review?.kind).toBe('structure');
    expect(review?.targetTitle).toBe('Géométrie');
    expect(review?.kind === 'structure' && review.blocks.map((b) => b.id)).toEqual([B1, B2]);
    expect(service.reviewVisible()).toBe(true);
  });

  it('accepting an addition creates the block, points its resource, places it, then decides', async () => {
    await reachProposal(ADD_EVENTS);
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse(resumed('propose_block_add')));
    vi.stubGlobal('fetch', resumeFetch);

    const accepted = service.proposals.accept('Oui');
    await settle();
    const post = http.expectOne(`${COURSE_URL}/blocks`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ type: 'document', title: 'Fiche', description: null });
    post.flush({ ...block(NEW, 'Fiche', 2), type: 'document', content: {} });
    await settle();
    const patch = http.expectOne(`${COURSE_URL}/blocks/${NEW}`);
    expect(patch.request.body).toEqual({ resource_id: RESOURCE });
    expect(resumeFetch).not.toHaveBeenCalled();
    patch.flush({ ...block(NEW, 'Fiche', 2), type: 'document', resource_id: RESOURCE });
    await settle();
    const order = http.expectOne(`${COURSE_URL}/blocks/order`);
    expect(order.request.method).toBe('PUT');
    expect(order.request.body).toEqual({ block_ids: [B1, NEW, B2] });
    order.flush(null);
    await accepted;

    expect(decisionBody(resumeFetch)).toEqual({ accepted: true, comment: 'Oui' });
    expect(service.pendingProposal()).toBeNull();
    expect(service.proposals.error()).toBeNull();
  });

  it('accepting a removal deletes the block before the decision', async () => {
    await reachProposal(DELETE_EVENTS);
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse(resumed('propose_block_delete')));
    vi.stubGlobal('fetch', resumeFetch);

    const accepted = service.proposals.accept('');
    await settle();
    const request = http.expectOne(`${COURSE_URL}/blocks/${B2}`);
    expect(request.request.method).toBe('DELETE');
    expect(resumeFetch).not.toHaveBeenCalled();
    request.flush(null);
    await accepted;
    expect(decisionBody(resumeFetch)).toEqual({ accepted: true, comment: null });
  });

  it('refuses a removal while the editor of that block is mounted', async () => {
    await reachProposal(DELETE_EVENTS);
    TestBed.inject(TargetApplierRegistry).register(B2, {
      apply: () => true,
      flush: () => Promise.resolve(),
    });
    const resumeFetch = vi.fn();
    vi.stubGlobal('fetch', resumeFetch);

    await service.proposals.accept('');

    expect(service.proposals.error()).toBe('target');
    expect(resumeFetch).not.toHaveBeenCalled();
    expect(service.pendingProposal()?.id).toBe('call_s');
  });

  it('accepting a reordering PUTs the full order', async () => {
    await reachProposal(REORDER_EVENTS);
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse(resumed('propose_blocks_reorder')));
    vi.stubGlobal('fetch', resumeFetch);

    const accepted = service.proposals.accept('');
    await settle();
    const order = http.expectOne(`${COURSE_URL}/blocks/order`);
    expect(order.request.body).toEqual({ block_ids: [B2, B1] });
    order.flush(null);
    await accepted;
    expect(resumeFetch).toHaveBeenCalledTimes(1);
  });

  it('reports `target` when the order no longer matches the course', async () => {
    await reachProposal(
      proposes('propose_blocks_reorder', { order: ['B2', 'B1'], block_ids: [B2, B1, NEW] }),
    );
    const resumeFetch = vi.fn();
    vi.stubGlobal('fetch', resumeFetch);

    await service.proposals.accept('');

    expect(service.proposals.error()).toBe('target');
    expect(resumeFetch).not.toHaveBeenCalled();
  });

  it('rejecting sends the decision alone', async () => {
    await reachProposal(DELETE_EVENTS);
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse(resumed('propose_block_delete')));
    vi.stubGlobal('fetch', resumeFetch);

    await service.proposals.reject('Non');

    expect(decisionBody(resumeFetch)).toEqual({ accepted: false, comment: 'Non' });
  });

  it('auto mode still reviews a removal (never auto-accepted)', async () => {
    TestBed.inject(ProposalModeService).setMode('auto');
    await reachProposal(DELETE_EVENTS);
    expect(service.proposals.review()?.kind).toBe('structure');
    expect(service.reviewVisible()).toBe(true);
  });
});
