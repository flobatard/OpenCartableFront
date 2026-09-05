import { AssistantStreamEvent } from './assistant.model';

/**
 * Parseur SSE incrémental.
 *
 * Le back émet des blocs `event: <nom>\ndata: <json>\n\n` (JSON compact,
 * flux clos après `done` ou `error`). Le réseau livre des chunks arbitraires,
 * y compris coupés au milieu d'un événement : le parseur accumule et ne
 * consomme que les blocs complets (terminés par `\n\n`), le reliquat attend
 * le chunk suivant. Un bloc malformé (event inconnu, JSON invalide) est
 * ignoré silencieusement — contrat additif : un futur type d'événement ne
 * doit pas casser les clients existants.
 *
 * Générique sur le vocabulaire : par défaut celui de l'assistant de cours
 * (`AssistantStreamEvent`) ; un autre flux (tuteur d'exercice élève,
 * `core/student/`) passe son propre jeu d'événements connus et son type.
 * Le transport (`postSseStream`, ci-dessous) est partagé de même.
 */
export interface SseParser<E extends { type: string } = AssistantStreamEvent> {
  /** Événements complets contenus dans ce chunk (et le reliquat précédent). */
  push(chunk: string): E[];
}

/** Événements du flux de l'assistant de cours (contrat SSE du back). */
export const ASSISTANT_EVENTS: ReadonlySet<string> = new Set<AssistantStreamEvent['type']>([
  'token',
  'thinking',
  'tool_call',
  'tool_result',
  'interrupt',
  'done',
  'error',
]);

export function createSseParser<E extends { type: string } = AssistantStreamEvent>(
  knownEvents: ReadonlySet<string> = ASSISTANT_EVENTS,
): SseParser<E> {
  let buffer = '';

  function parseBlock(block: string): E | null {
    let event: string | null = null;
    let data: string | null = null;
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        event = line.slice('event: '.length);
      } else if (line.startsWith('data: ')) {
        data = line.slice('data: '.length);
      }
    }
    if (event === null || data === null || !knownEvents.has(event)) {
      return null;
    }
    try {
      const payload = JSON.parse(data) as Record<string, unknown>;
      return { type: event, ...payload } as E;
    } catch {
      return null;
    }
  }

  return {
    push(chunk: string): E[] {
      buffer += chunk;
      const events: E[] = [];
      let separator: number;
      while ((separator = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        if (block.trim()) {
          const parsed = parseBlock(block);
          if (parsed !== null) {
            events.push(parsed);
          }
        }
      }
      return events;
    },
  };
}

export interface SseStreamRequest<E extends { type: string }> {
  url: string;
  body: unknown;
  accessToken: string | null;
  signal: AbortSignal;
  /** Vocabulaire d'événements connus (défaut : celui de l'assistant). */
  events?: ReadonlySet<string>;
  /** Appelé dès la réponse 2xx, avant la lecture du flux. */
  onOpen?: () => void;
  /** Traite un événement ; `true` = événement terminal (`done`/`error`/`interrupt`). */
  onEvent: (event: E) => boolean;
}

export type SseStreamOutcome = { status: number } | { closed: boolean };

/**
 * POST + lecture d'un flux SSE — hors du pipeline `HttpClient`, donc hors
 * intercepteur OIDC : c'est le SEUL endroit du front qui pose l'`Authorization`
 * à la main (depuis `AuthService.accessToken`, seule couche qui connaît le
 * token). `{ status }` : réponse non-2xx, flux jamais ouvert ; `{ closed }` :
 * flux consommé, `false` s'il s'est coupé sans événement terminal. Un abort
 * ou une erreur réseau lèvent : l'appelant décide du repli.
 */
export async function postSseStream<E extends { type: string }>(
  request: SseStreamRequest<E>,
): Promise<SseStreamOutcome> {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${request.accessToken}`,
    },
    body: JSON.stringify(request.body),
    signal: request.signal,
  });
  if (!response.ok || response.body === null) {
    return { status: response.status };
  }
  request.onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser<E>(request.events);
  let closed = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      closed = request.onEvent(event) || closed;
    }
  }
  return { closed };
}
