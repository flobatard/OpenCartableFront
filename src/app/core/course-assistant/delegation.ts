import type { ProposalToolCall } from './proposals';
import type { AssistantToolActivity } from './turn-reducer';

/**
 * Édition globale — délégation d'une modification par l'assistant du cours
 * à un **sous-assistant d'édition** : helpers PURS (aucune dépendance
 * Angular).
 *
 * Quand l'édition globale est activée (`GlobalEditService`, `allow_edit` du
 * tour), l'assistant du contexte `course` dispose des tools `edit_block` (bloc
 * texte ou exercice) et `edit_module`. Le back réécrit les args de l'appel à
 * l'émission (`app/course_assistant/delegation.py`) : l'id de la cible
 * (`block_id`/`module_id`), le contexte d'édition du descripteur
 * (`context`) et le titre affiché (`target_title`) s'ajoutent à la référence
 * courte et aux consignes — identiques sur le flux et dans les `tool_calls`
 * persistés. Le sous-assistant tourne dans le même flux : ses événements
 * portent `agent` (l'id de l'appel `edit_*`), sa proposition suit le flux
 * HITL ordinaire et l'hôte global (`CourseAssistantService`) la revoit et
 * l'applique sur la cible.
 */

export const EDIT_BLOCK = 'edit_block';
export const EDIT_MODULE = 'edit_module';

/** Tools de délégation (carte de délégation dans le fil, préchargement de la cible). */
export const DELEGATION_TOOLS: ReadonlySet<string> = new Set([EDIT_BLOCK, EDIT_MODULE]);

/** Contexte d'édition du sous-assistant (descripteur du back). */
export type DelegationContext = 'block_text' | 'block_exercise' | 'module';

const DELEGATION_CONTEXTS: ReadonlySet<string> = new Set([
  'block_text',
  'block_exercise',
  'module',
]);

/** Forme UUID : la cible finit interpolée dans une URL de l'API. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une délégation, telle que parsée depuis l'appel `edit_*` (args réécrits). */
export interface AssistantDelegation {
  /** Id de l'appel `edit_*` — les événements du sous-assistant le portent en `agent`. */
  id: string;
  context: DelegationContext;
  /** Cible : id du bloc (`block_text`/`block_exercise`) ou du module (`module`). */
  targetId: string;
  /** Titre affiché de la cible (chaîne vide si le back ne l'a pas donné). */
  targetTitle: string;
  /** Consignes rédigées par l'assistant pour le sous-assistant. */
  instructions: string;
}

/**
 * Parse un appel de tool de délégation ; `null` si le tool n'en est pas un ou
 * si ses args (réécrits par le back) sont malformés — l'appelant retombe alors
 * sur la ligne d'outil générique. Défensif : le back valide avant de figer.
 */
export function parseDelegation(call: ProposalToolCall): AssistantDelegation | null {
  if (!DELEGATION_TOOLS.has(call.name)) {
    return null;
  }
  const { args } = call;
  const context = args['context'];
  if (typeof context !== 'string' || !DELEGATION_CONTEXTS.has(context)) {
    return null;
  }
  const targetId = context === 'module' ? args['module_id'] : args['block_id'];
  const instructions = args['instructions'];
  if (typeof targetId !== 'string' || !UUID_RE.test(targetId) || typeof instructions !== 'string') {
    return null;
  }
  const title = args['target_title'];
  return {
    id: call.id,
    context: context as DelegationContext,
    targetId,
    targetTitle: typeof title === 'string' ? title : '',
    instructions,
  };
}

/** Activité émise par le sous-assistant de la délégation `id` (ordre du flux). */
export function childrenOf(
  activity: readonly AssistantToolActivity[],
  id: string,
): AssistantToolActivity[] {
  return activity.filter((entry) => entry.agent === id);
}
