/**
 * Propositions d'édition HITL de l'assistant — helpers PURS (aucune dépendance
 * Angular).
 *
 * Chaque contexte d'édition du back (`app/course_assistant/editing/`) expose
 * des **tools de proposition** : à l'événement `interrupt`, l'état du chat
 * retrouve l'appel figé dans son activité d'outils et le parse ici en une
 * proposition typée (`AssistantPendingProposal`, union discriminée par `kind`)
 * que l'hôte éditeur sait revoir puis appliquer. Les args parsés sont ceux
 * **réécrits par le back à l'émission** — ids résolus (`question_id`,
 * `after_id`), liens `oc-resource:`/`oc-module:` en UUID — identiques sur le
 * flux et dans les `tool_calls` persistés (une conversation rechargée se parse
 * pareil).
 *
 * - `block_text` : `propose_block_edit` — markdown INTÉGRAL de remplacement ;
 * - `block_exercise` (par question — décision actée) : `propose_statement_edit`
 *   (sujet), `propose_question_edit` (énoncé et/ou corrigé d'une question),
 *   `propose_question_add` (nouvelle question, position `after_id`),
 *   `propose_question_delete` ;
 * - `module` (par fichier — décision actée) : `propose_html_edit`,
 *   `propose_css_edit`, `propose_js_edit` — `new_code` INTÉGRAL de
 *   remplacement du fichier visé (aucune référence courte à résoudre : le code
 *   d'un module n'est pas du markdown de cours).
 */

export const PROPOSE_BLOCK_EDIT = 'propose_block_edit';
export const PROPOSE_STATEMENT_EDIT = 'propose_statement_edit';
export const PROPOSE_QUESTION_EDIT = 'propose_question_edit';
export const PROPOSE_QUESTION_ADD = 'propose_question_add';
export const PROPOSE_QUESTION_DELETE = 'propose_question_delete';
export const PROPOSE_HTML_EDIT = 'propose_html_edit';
export const PROPOSE_CSS_EDIT = 'propose_css_edit';
export const PROPOSE_JS_EDIT = 'propose_js_edit';

/** Tools HITL connus (carte de proposition dans le fil, revue chez l'hôte). */
export const PROPOSAL_TOOLS: ReadonlySet<string> = new Set([
  PROPOSE_BLOCK_EDIT,
  PROPOSE_STATEMENT_EDIT,
  PROPOSE_QUESTION_EDIT,
  PROPOSE_QUESTION_ADD,
  PROPOSE_QUESTION_DELETE,
  PROPOSE_HTML_EDIT,
  PROPOSE_CSS_EDIT,
  PROPOSE_JS_EDIT,
]);

interface ProposalBase {
  /** Id de l'appel d'outil (clé de la reprise côté back). */
  id: string;
  /** Résumé du changement fourni par le modèle (`null` s'il l'a omis). */
  summary: string | null;
}

/** Proposition d'édition en attente de décision (le run est figé côté back). */
export type AssistantPendingProposal =
  | (ProposalBase & { kind: 'block_text'; markdown: string })
  | (ProposalBase & { kind: 'exercise_statement'; statement: string })
  | (ProposalBase & {
      kind: 'exercise_question_edit';
      questionId: string;
      /** `null` = champ non modifié par la proposition. */
      statement: string | null;
      expectedAnswer: string | null;
    })
  | (ProposalBase & {
      kind: 'exercise_question_add';
      statement: string;
      expectedAnswer: string;
      /** Question après laquelle insérer ; `null` = en fin d'exercice. */
      afterId: string | null;
    })
  | (ProposalBase & { kind: 'exercise_question_delete'; questionId: string })
  | (ProposalBase & { kind: 'module_html' | 'module_css' | 'module_js'; code: string });

export type AssistantProposalKind = AssistantPendingProposal['kind'];

/** Propositions du contexte `block_exercise` (revue structurée par opération). */
export type AssistantExerciseProposal = Extract<
  AssistantPendingProposal,
  { kind: `exercise_${string}` }
>;

/** Propositions du contexte `module` (un fichier de code par proposition). */
export type AssistantModuleProposal = Extract<
  AssistantPendingProposal,
  { kind: `module_${string}` }
>;

/** Fichier d'un module visé par une proposition (clé du payload d'autosave). */
export type ModuleProposalFile = 'html' | 'css' | 'js';

export const MODULE_FILE_BY_KIND: Readonly<
  Record<AssistantModuleProposal['kind'], ModuleProposalFile>
> = {
  module_html: 'html',
  module_css: 'css',
  module_js: 'js',
};

/** Nom du tool back porteur de chaque genre de proposition (libellés i18n). */
export const PROPOSAL_TOOL_BY_KIND: Readonly<Record<AssistantProposalKind, string>> = {
  block_text: PROPOSE_BLOCK_EDIT,
  exercise_statement: PROPOSE_STATEMENT_EDIT,
  exercise_question_edit: PROPOSE_QUESTION_EDIT,
  exercise_question_add: PROPOSE_QUESTION_ADD,
  exercise_question_delete: PROPOSE_QUESTION_DELETE,
  module_html: PROPOSE_HTML_EDIT,
  module_css: PROPOSE_CSS_EDIT,
  module_js: PROPOSE_JS_EDIT,
};

/** Un appel d'outil tel que tracé (activité live ou `tool_calls` persistés). */
export interface ProposalToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Parse un appel de tool de proposition en proposition typée ; `null` si le
 * tool n'en est pas un ou si ses args (réécrits par le back) sont malformés —
 * l'appelant retombe alors sur l'affichage générique (ligne d'outil, aucune
 * revue). Défensif : le back valide avant de figer un run.
 */
export function parseProposal(call: ProposalToolCall): AssistantPendingProposal | null {
  const { id, name, args } = call;
  const summaryRaw = args['summary'];
  const summary = typeof summaryRaw === 'string' && summaryRaw ? summaryRaw : null;
  switch (name) {
    case PROPOSE_BLOCK_EDIT: {
      const markdown = args['new_markdown'];
      return typeof markdown === 'string' ? { kind: 'block_text', id, summary, markdown } : null;
    }
    case PROPOSE_STATEMENT_EDIT: {
      const statement = args['new_statement'];
      return typeof statement === 'string'
        ? { kind: 'exercise_statement', id, summary, statement }
        : null;
    }
    case PROPOSE_QUESTION_EDIT: {
      const questionId = args['question_id'];
      const statement = optionalString(args['statement']);
      const expectedAnswer = optionalString(args['expected_answer']);
      if (typeof questionId !== 'string' || (statement === null && expectedAnswer === null)) {
        return null;
      }
      return { kind: 'exercise_question_edit', id, summary, questionId, statement, expectedAnswer };
    }
    case PROPOSE_QUESTION_ADD: {
      const statement = args['statement'];
      if (typeof statement !== 'string') {
        return null;
      }
      return {
        kind: 'exercise_question_add',
        id,
        summary,
        statement,
        expectedAnswer: optionalString(args['expected_answer']) ?? '',
        afterId: optionalString(args['after_id']),
      };
    }
    case PROPOSE_QUESTION_DELETE: {
      const questionId = args['question_id'];
      return typeof questionId === 'string'
        ? { kind: 'exercise_question_delete', id, summary, questionId }
        : null;
    }
    case PROPOSE_HTML_EDIT:
    case PROPOSE_CSS_EDIT:
    case PROPOSE_JS_EDIT: {
      const code = args['new_code'];
      if (typeof code !== 'string') {
        return null;
      }
      const kind =
        name === PROPOSE_HTML_EDIT
          ? 'module_html'
          : name === PROPOSE_CSS_EDIT
            ? 'module_css'
            : 'module_js';
      return { kind, id, summary, code };
    }
    default:
      return null;
  }
}
