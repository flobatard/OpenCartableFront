import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssistantMessage } from '../../../core/course-assistant/assistant.model';
import { parseProposal, PROPOSAL_TOOLS } from '../../../core/course-assistant/proposals';
import { ASK_QUESTIONS, parseQuestions } from '../../../core/course-assistant/questions';

/**
 * Longueur de l'extrait de résultat affiché — même valeur que
 * `TOOL_RESULT_EXCERPT_CHARS` côté back (`app/course_assistant/turn_encoder.py`) :
 * un tour `tool` rechargé (contenu complet) et un tour replié depuis le flux
 * (extrait streamé) se présentent à l'identique.
 */
export const TOOL_RESULT_EXCERPT_CHARS = 400;

/** Outils du back (`app/course_assistant/tools.py`, tools de proposition de
    `app/course_assistant/editing/`, `ask_questions`, tools de délégation de
    `app/course_assistant/delegation.py`) : libellé i18n dédié, repli générique
    sinon. Les tools de proposition, de questions et de délégation
    n'apparaissent ici qu'en repli (appel échoué ou args malformés) — le cas
    nominal est rendu en carte (`app-course-chat-proposal`,
    `app-course-chat-questions-card`, `app-course-chat-delegation`), jamais en
    ligne d'outil. */
const KNOWN_TOOLS = new Set([
  'read_block',
  'read_resource_pdf',
  'read_resource_image',
  'read_module',
  'propose_block_edit',
  'propose_statement_edit',
  'propose_question_edit',
  'propose_question_add',
  'propose_question_delete',
  'propose_html_edit',
  'propose_css_edit',
  'propose_js_edit',
  'propose_block_add',
  'propose_block_delete',
  'propose_blocks_reorder',
  'ask_questions',
  'edit_block',
  'edit_module',
]);

/** Un appel d'outil tel que rendu par le fil : persisté ou en cours. */
export interface ChatToolView {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  /** Extrait du résultat (message d'échec complet en erreur) ; `null` si inconnu ou en cours. */
  result: string | null;
}

/**
 * Vrai pour un appel d'un tool de proposition rendu en carte : args bien
 * formés (`parseProposal` — malformés → ligne d'outil générique) et appel
 * non échoué (l'échec — plafond dépassé, référence inconnue… — s'explique
 * mieux en ligne d'outil, son message d'erreur visible). Tous modes : une
 * proposition de sous-assistant apparaît aussi dans le panneau global.
 */
export function isProposalView(view: ChatToolView): boolean {
  return PROPOSAL_TOOLS.has(view.name) && view.status !== 'error' && parseProposal(view) !== null;
}

/**
 * Vrai pour un appel `ask_questions` rendu en carte : args bien formés et
 * appel non échoué (refus de validation ou garde « un outil bloquant par
 * réponse » : la ligne d'outil montre son message d'erreur).
 */
export function isQuestionsView(view: ChatToolView): boolean {
  return view.name === ASK_QUESTIONS && view.status !== 'error' && parseQuestions(view) !== null;
}

/** Extrait affichable du contenu d'un tour `tool` persisté (servi complet par l'API). */
export function toolResultExcerpt(content: string): string {
  return content.length > TOOL_RESULT_EXCERPT_CHARS
    ? content.slice(0, TOOL_RESULT_EXCERPT_CHARS) + '…'
    : content;
}

/** Tours `tool` d'une conversation, indexés par id d'appel (résultats persistés). */
export function toolRowsById(messages: readonly AssistantMessage[]): Map<string, AssistantMessage> {
  const rows = new Map<string, AssistantMessage>();
  for (const message of messages) {
    if (message.role === 'tool' && message.tool_call_id) {
      rows.set(message.tool_call_id, message);
    }
  }
  return rows;
}

/**
 * Appels d'outils d'un message assistant, appariés à leurs tours `tool`
 * (`is_error` et extrait du contenu). Sans tour apparié (round interrompu
 * avant le résultat) : résultat indisponible (`null`).
 */
export function toolViewsFor(
  message: AssistantMessage,
  rows: ReadonlyMap<string, AssistantMessage>,
): ChatToolView[] {
  return message.tool_calls.map((call) => {
    const row = rows.get(call.id);
    return {
      id: call.id,
      name: call.name,
      args: call.arguments ?? {},
      status: row?.is_error ? 'error' : 'done',
      result: row?.content ? toolResultExcerpt(row.content) : null,
    };
  });
}

/**
 * Ligne d'appel d'outil dépliable (`<details>` natif) : repliée, glyphe +
 * libellé + état (en cours / échec) ; dépliée, les paramètres de l'appel en
 * clé/valeur et le résultat — le message d'erreur complet en cas d'échec, un
 * extrait sinon (le contenu intégral reste côté serveur, cf. contrat SSE).
 */
@Component({
  selector: 'app-course-chat-tool',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-tool.html',
  styleUrl: './course-chat-tool.scss',
})
export class CourseChatTool {
  readonly tool = input.required<ChatToolView>();

  protected readonly labelKey = computed(() => {
    const name = this.tool().name;
    return KNOWN_TOOLS.has(name) ? `courseChat.tools.${name}` : 'courseChat.tools.unknown';
  });

  /** Paramètres en lignes clé/valeur (valeurs non textuelles sérialisées en JSON). */
  protected readonly argEntries = computed(() =>
    Object.entries(this.tool().args ?? {}).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    })),
  );
}
