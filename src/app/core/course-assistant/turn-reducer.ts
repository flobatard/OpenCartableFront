import { AssistantMessage, AssistantSources, AssistantStreamEvent } from './assistant.model';

/**
 * Fonctions PURES du tour streamé de l'assistant : activité d'outils tenue
 * à jour par les événements `tool_call`/`tool_result`, puis repli du tour en
 * messages locaux à la clôture (`done`, erreur, abort). L'état
 * (`AssistantChatState`) ne fait qu'appliquer ces fonctions à ses signaux.
 */

/** Activité d'outil du tour en cours (affichage live du panneau). */
export interface AssistantToolActivity {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  /** Arguments de l'appel, tels qu'émis par le modèle (événement `tool_call`). */
  args: Record<string, unknown>;
  /**
   * Extrait du résultat (`excerpt` du flux, suivi de « … » s'il est tronqué) —
   * message d'échec complet en cas d'erreur ; `null` tant que l'outil tourne.
   */
  result: string | null;
}

/** Message local en attente d'insertion (les champs absents sont complétés par l'état). */
export type LocalMessage = Partial<AssistantMessage> & Pick<AssistantMessage, 'role' | 'content'>;

type ToolCallEvent = Extract<AssistantStreamEvent, { type: 'tool_call' }>;
type ToolResultEvent = Extract<AssistantStreamEvent, { type: 'tool_result' }>;

/** Entrée d'activité d'un `tool_call` : outil en cours, résultat inconnu. */
export function toolActivityFromCall(event: ToolCallEvent): AssistantToolActivity {
  return {
    id: event.id,
    name: event.name,
    status: 'running',
    args: event.args ?? {},
    result: null,
  };
}

/**
 * Applique un `tool_result` à l'entrée de même id : état `done`/`error` et
 * extrait du résultat (« … » ajouté s'il est tronqué). Contrat additif : un
 * back plus ancien n'envoie ni `excerpt` ni `length`.
 */
export function applyToolResult(
  activity: readonly AssistantToolActivity[],
  event: ToolResultEvent,
): AssistantToolActivity[] {
  const excerpt = event.excerpt ?? '';
  const truncated = (event.length ?? excerpt.length) > excerpt.length;
  return activity.map((entry) =>
    entry.id === event.id
      ? {
          ...entry,
          status: event.is_error ? 'error' : 'done',
          result: excerpt ? excerpt + (truncated ? '…' : '') : null,
        }
      : entry,
  );
}

/**
 * Replie un tour streamé en messages locaux : l'activité d'outils devient des
 * tours `tool` (contenu = l'extrait streamé, jamais le résultat complet), le
 * texte accumulé le message assistant final — même forme que les lignes
 * serveur : l'assistant porte les `tool_calls` (le fil rend l'activité depuis
 * eux, l'`is_error` depuis les tours tool). Rien si le tour est vide.
 */
export function foldTurnMessages(
  activity: readonly AssistantToolActivity[],
  text: string,
  sources: AssistantSources | null,
): LocalMessage[] {
  const messages: LocalMessage[] = activity.map((entry) => ({
    role: 'tool',
    content: entry.result ?? '',
    tool_call_id: entry.id,
    is_error: entry.status === 'error',
  }));
  if (text || activity.length > 0) {
    messages.push({
      role: 'assistant',
      content: text,
      tool_calls: activity.map((entry) => ({
        id: entry.id,
        name: entry.name,
        arguments: entry.args,
      })),
      sources: sources ?? {},
    });
  }
  return messages;
}
