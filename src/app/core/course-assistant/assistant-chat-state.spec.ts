import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AssistantChatState } from './assistant-chat-state';
import { AssistantConversation } from './assistant.model';

const BASE = `${environment.apiUrl}/v1/courses/c1/assistant/conversations`;

const BLOCK_CONVERSATION: AssistantConversation = {
  id: 'conv-b1',
  context: 'block_text',
  block_id: 'b1',
  module_id: null,
  title: null,
  created_at: '2026-08-31T10:00:00Z',
  updated_at: '2026-08-31T10:00:00Z',
};

/** Réponse fetch streamant les chunks donnés (motif course-assistant.service.spec). */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const DONE_EVENT =
  'event: done\ndata: {"usage":null,"user_message_id":"u1","message_ids":["m1"],' +
  '"sources":{},"title":"T"}\n\n';

/**
 * La portée `block_text` d'`AssistantChatState` (le régime `course`, défaut,
 * est couvert par `course-assistant.service.spec.ts` sur la sous-classe root).
 */
describe('AssistantChatState (portée block_text)', () => {
  let state: AssistantChatState;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AssistantChatState,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => true, accessToken: 'jwt-token' },
        },
      ],
    });
    state = TestBed.inject(AssistantChatState);
    state.configure({ context: 'block_text', blockId: 'b1' });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadList(): Promise<void> {
    const promise = state.loadConversations('c1');
    http.expectOne((r) => r.url === BASE).flush([BLOCK_CONVERSATION]);
    await promise;
  }

  it('lists with the context and block_id query params', async () => {
    const promise = state.loadConversations('c1');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('context')).toBe('block_text');
    expect(req.request.params.get('block_id')).toBe('b1');
    req.flush([BLOCK_CONVERSATION]);
    await promise;
    expect(state.conversations()).toEqual([BLOCK_CONVERSATION]);
  });

  it('the entry draft carries the configured scope', async () => {
    await loadList();
    expect(state.active()?.id).toBe('');
    expect(state.active()?.context).toBe('block_text');
    expect(state.active()?.block_id).toBe('b1');
    http.verify();
  });

  it('materializing the draft posts context + block_id', async () => {
    await loadList();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([DONE_EVENT])));

    const promise = state.sendMessage('Réécris ce bloc');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.body).toEqual({ context: 'block_text', block_id: 'b1' });
    req.flush({ ...BLOCK_CONVERSATION, id: 'conv-b2' });
    await promise;

    expect(state.streamState()).toBe('idle');
  });

  it('awaits the beforeTurn hook before any request of the turn', async () => {
    await loadList();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([DONE_EVENT])));
    let resolveHook!: () => void;
    const hook = vi.fn(() => new Promise<void>((resolve) => (resolveHook = resolve)));
    state.setBeforeTurn(hook);

    const promise = state.sendMessage('Bonjour');
    await Promise.resolve(); // laisse sendMessage atteindre l'await du hook
    expect(hook).toHaveBeenCalledTimes(1);
    // Tant que le hook n'est pas résolu : aucun POST de création n'est parti,
    // mais le message local est déjà affiché et le flux marqué en cours.
    expect(http.match((r) => r.url === BASE)).toHaveLength(0);
    expect(state.active()?.messages.at(-1)?.content).toBe('Bonjour');
    expect(state.streamState()).toBe('streaming');

    resolveHook();
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne((r) => r.url === BASE).flush({ ...BLOCK_CONVERSATION, id: 'conv-b2' });
    await promise;
    expect(state.streamState()).toBe('idle');
  });

  const INTERRUPT_EVENTS =
    'event: tool_call\ndata: {"id":"call_p","name":"propose_block_edit",' +
    '"args":{"new_markdown":"# Proposé","summary":"Réécriture"}}\n\n' +
    'event: interrupt\ndata: {"tool_call_id":"call_p","message_ids":["m1"]}\n\n';

  /** Amène l'état en `awaiting` : envoi → tool_call propose → interrupt. */
  async function reachAwaiting(): Promise<void> {
    await loadList();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([INTERRUPT_EVENTS])));
    const send = state.sendMessage('Réécris ce bloc');
    http.expectOne((r) => r.url === BASE).flush({ ...BLOCK_CONVERSATION, id: 'conv-b2' });
    await send;
  }

  it('an interrupt closes the stream into awaiting, carrying the pending proposal', async () => {
    await reachAwaiting();
    expect(state.streamState()).toBe('awaiting');
    expect(state.pendingProposal()).toEqual({
      kind: 'block_text',
      id: 'call_p',
      markdown: '# Proposé',
      summary: 'Réécriture',
    });
    // Le tour reste affiché en l'état (activité d'outils non repliée).
    expect(state.toolActivity().map((entry) => entry.id)).toEqual(['call_p']);
  });

  it('resumeProposal awaits the beforeTurn hook (autosave flush) before the POST', async () => {
    await reachAwaiting();
    const resumeFetch = vi.fn().mockResolvedValue(sseResponse([DONE_EVENT]));
    vi.stubGlobal('fetch', resumeFetch);
    let resolveHook!: () => void;
    const hook = vi.fn(() => new Promise<void>((resolve) => (resolveHook = resolve)));
    state.setBeforeTurn(hook);

    const promise = state.resumeProposal({ accepted: true });
    await Promise.resolve();
    expect(hook).toHaveBeenCalledTimes(1);
    // Tant que le flush n'est pas fini, la décision n'est pas partie (le back
    // relirait le bloc d'AVANT l'application).
    expect(resumeFetch).not.toHaveBeenCalled();
    expect(state.streamState()).toBe('streaming');

    resolveHook();
    await expect(promise).resolves.toBe(true);
    expect(resumeFetch).toHaveBeenCalledTimes(1);
  });

  it('resumeProposal reopens a stream with the decision and consumes the pending', async () => {
    await reachAwaiting();
    const resumeFetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: tool_result\ndata: {"id":"call_p","name":"propose_block_edit",' +
            '"is_error":false,"excerpt":"ACCEPTÉ","length":7}\n\n',
          DONE_EVENT,
        ]),
      );
    vi.stubGlobal('fetch', resumeFetch);

    await expect(state.resumeProposal({ accepted: true, comment: 'Très bien' })).resolves.toBe(
      true,
    );
    const [url, init] = resumeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/conv-b2/proposals/call_p/decision`);
    expect(JSON.parse(init.body as string)).toEqual({ accepted: true, comment: 'Très bien' });
    expect(state.pendingProposal()).toBeNull();
    expect(state.streamState()).toBe('idle');
  });

  it('a failed resume keeps the proposal retryable — except a 404 (resume gone)', async () => {
    await reachAwaiting();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })));
    await expect(state.resumeProposal({ accepted: false })).resolves.toBe(false);
    expect(state.pendingProposal()).not.toBeNull();
    expect(state.streamState()).toBe('error');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 404 })));
    await expect(state.resumeProposal({ accepted: false })).resolves.toBe(false);
    expect(state.pendingProposal()).toBeNull();
  });

  it('sending a new message abandons the pending proposal locally', async () => {
    await reachAwaiting();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([DONE_EVENT])));
    await state.sendMessage('Autre chose');
    expect(state.pendingProposal()).toBeNull();
    expect(state.streamState()).toBe('idle');
  });

  it('a failing beforeTurn hook never blocks the turn', async () => {
    await loadList();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([DONE_EVENT])));
    state.setBeforeTurn(vi.fn().mockRejectedValue(new Error('flush failed')));

    const promise = state.sendMessage('Bonjour');
    // Microtâches du hook rejeté avant que le POST parte.
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne((r) => r.url === BASE).flush({ ...BLOCK_CONVERSATION, id: 'conv-b2' });
    await promise;

    expect(state.streamState()).toBe('idle');
  });
});

/** La portée `block_exercise` : même mécanique, propositions par question. */
describe('AssistantChatState (portée block_exercise)', () => {
  let state: AssistantChatState;
  let http: HttpTestingController;
  const EXERCISE_CONVERSATION: AssistantConversation = {
    ...BLOCK_CONVERSATION,
    id: 'conv-e1',
    context: 'block_exercise',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AssistantChatState,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => true, accessToken: 'jwt-token' },
        },
      ],
    });
    state = TestBed.inject(AssistantChatState);
    state.configure({ context: 'block_exercise', blockId: 'b1' });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function reachInterrupt(toolCallEvent: string): Promise<void> {
    const load = state.loadConversations('c1');
    http.expectOne((r) => r.url === BASE).flush([EXERCISE_CONVERSATION]);
    await load;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            toolCallEvent,
            'event: interrupt\ndata: {"tool_call_id":"call_p","message_ids":["m1"]}\n\n',
          ]),
        ),
    );
    const send = state.sendMessage('Complète le corrigé');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.body).toEqual({ context: 'block_exercise', block_id: 'b1' });
    req.flush({ ...EXERCISE_CONVERSATION, id: 'conv-e2' });
    await send;
  }

  it('lists with the block_exercise context', async () => {
    const promise = state.loadConversations('c1');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('context')).toBe('block_exercise');
    expect(req.request.params.get('block_id')).toBe('b1');
    req.flush([]);
    await promise;
    expect(state.active()?.context).toBe('block_exercise');
  });

  it('an interrupt on an exercise tool carries the typed proposal (rewritten args)', async () => {
    await reachInterrupt(
      'event: tool_call\ndata: {"id":"call_p","name":"propose_question_edit",' +
        '"args":{"question_ref":"Q2","question_id":"q-2","expected_answer":"42",' +
        '"summary":"Corrigé ajouté"}}\n\n',
    );
    expect(state.streamState()).toBe('awaiting');
    expect(state.pendingProposal()).toEqual({
      kind: 'exercise_question_edit',
      id: 'call_p',
      summary: 'Corrigé ajouté',
      questionId: 'q-2',
      statement: null,
      expectedAnswer: '42',
    });
  });

  it('a malformed proposal (unresolved question) finalizes the turn without a review', async () => {
    await reachInterrupt(
      'event: tool_call\ndata: {"id":"call_p","name":"propose_question_delete",' +
        '"args":{"question_ref":"Q9","question_id":null}}\n\n',
    );
    expect(state.pendingProposal()).toBeNull();
    expect(state.streamState()).toBe('idle');
    // Le tour est replié : l'appel figure dans le message assistant local.
    expect(
      state
        .active()
        ?.messages.at(-1)
        ?.tool_calls.map((c) => c.name),
    ).toEqual(['propose_question_delete']);
  });
});

/**
 * La portée `module` : même mécanique, mais la cible est un module
 * (`module_id`) et non un bloc — le contexte d'édition du code d'un module
 * interactif (une proposition par fichier).
 */
describe('AssistantChatState (portée module)', () => {
  let state: AssistantChatState;
  let http: HttpTestingController;
  const MODULE_CONVERSATION: AssistantConversation = {
    id: 'conv-m1',
    context: 'module',
    block_id: null,
    module_id: 'm1',
    title: null,
    created_at: '2026-08-31T10:00:00Z',
    updated_at: '2026-08-31T10:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AssistantChatState,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => true, accessToken: 'jwt-token' },
        },
      ],
    });
    state = TestBed.inject(AssistantChatState);
    state.configure({ context: 'module', moduleId: 'm1' });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists with the context and module_id query params (never block_id)', async () => {
    const promise = state.loadConversations('c1');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('context')).toBe('module');
    expect(req.request.params.get('module_id')).toBe('m1');
    expect(req.request.params.get('block_id')).toBeNull();
    req.flush([MODULE_CONVERSATION]);
    await promise;
    expect(state.conversations()).toEqual([MODULE_CONVERSATION]);
  });

  it('creates the conversation scoped to the module at the first message', async () => {
    const load = state.loadConversations('c1');
    http.expectOne((r) => r.url === BASE).flush([]);
    await load;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([DONE_EVENT])));

    const sent = state.sendMessage('Mets le bouton en bleu');
    const create = http.expectOne((r) => r.url === BASE && r.method === 'POST');
    expect(create.request.body).toEqual({ context: 'module', module_id: 'm1' });
    create.flush(MODULE_CONVERSATION);
    await sent;
    expect(state.streamState()).toBe('idle');
  });

  it('an interrupt on a code tool carries the typed proposal', async () => {
    const load = state.loadConversations('c1');
    http.expectOne((r) => r.url === BASE).flush([MODULE_CONVERSATION]);
    await load;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'event: tool_call\ndata: {"id":"call_p","name":"propose_js_edit",' +
              '"args":{"new_code":"const x = 1;","summary":"Compteur"}}\n\n',
            'event: interrupt\ndata: {"tool_call_id":"call_p","message_ids":["m1"]}\n\n',
          ]),
        ),
    );
    const send = state.sendMessage('Ajoute un compteur');
    const create = http.expectOne((r) => r.url === BASE && r.method === 'POST');
    expect(create.request.body).toEqual({ context: 'module', module_id: 'm1' });
    create.flush({ ...MODULE_CONVERSATION, id: 'conv-m2' });
    await send;

    expect(state.streamState()).toBe('awaiting');
    expect(state.pendingProposal()).toEqual({
      kind: 'module_js',
      id: 'call_p',
      summary: 'Compteur',
      code: 'const x = 1;',
    });
  });
});
