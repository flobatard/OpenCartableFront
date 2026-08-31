import { AssistantStreamEvent } from './assistant.model';

/**
 * Parseur SSE incrémental — premier client Server-Sent Events du projet.
 *
 * Le back émet des blocs `event: <nom>\ndata: <json>\n\n` (JSON compact,
 * flux clos après `done` ou `error`). Le réseau livre des chunks arbitraires,
 * y compris coupés au milieu d'un événement : le parseur accumule et ne
 * consomme que les blocs complets (terminés par `\n\n`), le reliquat attend
 * le chunk suivant. Un bloc malformé (event inconnu, JSON invalide) est
 * ignoré silencieusement — contrat additif : un futur type d'événement ne
 * doit pas casser les clients existants.
 */
export interface SseParser {
  /** Événements complets contenus dans ce chunk (et le reliquat précédent). */
  push(chunk: string): AssistantStreamEvent[];
}

const KNOWN_EVENTS = new Set<AssistantStreamEvent['type']>([
  'token',
  'thinking',
  'tool_call',
  'tool_result',
  'done',
  'error',
]);

export function createSseParser(): SseParser {
  let buffer = '';

  function parseBlock(block: string): AssistantStreamEvent | null {
    let event: string | null = null;
    let data: string | null = null;
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        event = line.slice('event: '.length);
      } else if (line.startsWith('data: ')) {
        data = line.slice('data: '.length);
      }
    }
    if (event === null || data === null || !KNOWN_EVENTS.has(event as AssistantStreamEvent['type'])) {
      return null;
    }
    try {
      const payload = JSON.parse(data) as Record<string, unknown>;
      return { type: event, ...payload } as AssistantStreamEvent;
    } catch {
      return null;
    }
  }

  return {
    push(chunk: string): AssistantStreamEvent[] {
      buffer += chunk;
      const events: AssistantStreamEvent[] = [];
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
