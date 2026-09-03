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
 *
 * Générique sur le vocabulaire : par défaut celui de l'assistant de cours
 * (`AssistantStreamEvent`) ; un autre flux (tuteur d'exercice élève,
 * `core/student/`) passe son propre jeu d'événements connus et son type.
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
