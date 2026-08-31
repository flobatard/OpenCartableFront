import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AssistantConversation, AssistantConversationDetail } from './assistant.model';
import { CourseAssistantService } from './course-assistant.service';

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

/** Réponse fetch streamant les chunks donnés (découpables mi-événement). */
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
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

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
