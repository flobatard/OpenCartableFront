/**
 * Modèles de l'assistant IA d'un cours — miroir snake_case de l'API
 * (`/v1/courses/{id}/assistant/*`, OpenCartableBack app/course_assistant/).
 */

/**
 * Contextes de conversation LIVRÉS (`ai_conversations.context`) : `course`
 * (chat global) et les contextes d'édition (flux HITL, cf. `proposals.ts`) —
 * d'un bloc (`block_text`, `block_exercise`, cible `block_id`) ou d'un module
 * interactif (`module`, cible `module_id`).
 */
export type AssistantContext = 'course' | 'block_text' | 'block_exercise' | 'module';

export interface AssistantConversation {
  id: string;
  context: string;
  block_id: string | null;
  module_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

/** Un appel d'outil tracé sur un message assistant (données d'affichage). */
export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Ids cités par une réponse, validés par le back (hallucinations filtrées). */
export interface AssistantSources {
  blocks?: string[];
  resources?: string[];
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  position: number;
  content: string;
  tool_calls: AssistantToolCall[];
  tool_call_id: string | null;
  is_error: boolean;
  sources: AssistantSources;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export interface AssistantConversationDetail extends AssistantConversation {
  messages: AssistantMessage[];
}

/** Usage relayé par l'événement `done` (souvent partiel selon le provider). */
export interface AssistantUsage {
  input_tokens: number | null;
  output_tokens: number | null;
}

/**
 * Événements du flux SSE (contrat de app/course_assistant/service.py) —
 * union discriminée par `type`. Le contenu COMPLET des résultats d'outils ne
 * voyage jamais sur le flux (persisté, servi par le détail de conversation) :
 * `tool_result` n'en porte qu'un extrait borné (`excerpt`, 400 caractères côté
 * back — un message d'échec tient toujours dedans) et la longueur totale.
 */
export type AssistantStreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | {
      type: 'tool_result';
      id: string;
      name: string;
      is_error: boolean;
      excerpt: string;
      length: number;
    }
  | { type: 'interrupt'; tool_call_id: string; message_ids: string[] }
  | {
      type: 'done';
      usage: AssistantUsage | null;
      user_message_id: string | null;
      message_ids: string[];
      sources: AssistantSources;
      title: string | null;
    }
  | { type: 'error'; status: number; detail: string };
