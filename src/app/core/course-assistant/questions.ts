import { AssistantMessage } from './assistant.model';
import { ProposalToolCall } from './proposals';

/**
 * Questions de l'assistant au professeur — helpers PURS (aucune dépendance
 * Angular).
 *
 * Dans tous les contextes de conversation, le modèle peut appeler le tool
 * `ask_questions` (back : `app/course_assistant/questions.py`) : 1 à 4
 * questions à choix unique ou multiple, chacune avec des suggestions. Le run
 * est figé (événement `interrupt`, genre `questions`) : l'état du chat
 * retrouve l'appel dans son activité d'outils — ou, à la réouverture d'une
 * conversation, dans ses `tool_calls` persistés
 * (`pendingQuestionsFromHistory`) — et le parse ici. Le chat affiche alors les
 * questions À LA PLACE de son champ de saisie, une par étape : un brouillon
 * par question (`QuestionDraft`), un choix libre « Autre » toujours ajouté.
 * La réponse désigne les suggestions par leur INDEX dans les args (ordre
 * conservé par le parse, forme contrôlée par le back) ; la croix envoie un
 * refus (`{declined: true}`).
 */

export const ASK_QUESTIONS = 'ask_questions';

/** Longueur maximale d'une réponse libre « Autre » — miroir de
    `MAX_QUESTION_OTHER_CHARS` (back, `app/course_assistant/questions.py`). */
export const MAX_QUESTION_OTHER_CHARS = 1000;

export interface AssistantQuestionOption {
  label: string;
  /** Précision facultative du modèle, sous le libellé. */
  description: string | null;
}

export interface AssistantQuestion {
  text: string;
  /** `true` : plusieurs choix possibles (cases à cocher) ; sinon un seul. */
  multiSelect: boolean;
  options: AssistantQuestionOption[];
}

/** Questions en attente de réponse (le run est figé côté back). */
export interface AssistantPendingQuestions {
  /** Id de l'appel d'outil (clé de la reprise côté back). */
  id: string;
  questions: AssistantQuestion[];
  /** Reproposées à la réouverture de la conversation (et non reçues sur le flux). */
  reoffered: boolean;
}

/** Réponse à UNE question : index des suggestions choisies et réponse libre. */
export interface QuestionAnswer {
  selected: number[];
  other: string | null;
}

/** Ce que le professeur envoie : une réponse par question, ou le refus de répondre. */
export type QuestionsReply = { declined: true } | { declined: false; answers: QuestionAnswer[] };

/** Saisie en cours d'une question (formulaire du chat). */
export interface QuestionDraft {
  /** Index des suggestions cochées, dans l'ordre des options. */
  selected: number[];
  otherChecked: boolean;
  otherText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Texte non vide, espaces réduits ; `null` sinon. */
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.replace(/\s+/g, ' ').trim();
  return text || null;
}

function parseQuestion(item: unknown): AssistantQuestion | null {
  if (!isRecord(item)) {
    return null;
  }
  const text = cleanText(item['question']);
  const multiSelect = item['multi_select'];
  const options = item['options'];
  if (
    text === null ||
    (multiSelect !== undefined && multiSelect !== null && typeof multiSelect !== 'boolean') ||
    !Array.isArray(options) ||
    options.length === 0
  ) {
    return null;
  }
  const parsed: AssistantQuestionOption[] = [];
  for (const option of options) {
    if (!isRecord(option)) {
      return null;
    }
    const label = cleanText(option['label']);
    if (label === null) {
      return null;
    }
    parsed.push({ label, description: cleanText(option['description']) });
  }
  return { text, multiSelect: multiSelect === true, options: parsed };
}

/**
 * Parse un appel `ask_questions` en questions typées ; `null` si ce n'est pas
 * ce tool ou si un élément est malformé — l'appelant retombe alors sur la
 * ligne d'outil générique. Défensif : le back valide avant de figer le run.
 * L'ordre des questions et des options est celui des args.
 */
export function parseQuestions(call: ProposalToolCall): AssistantQuestion[] | null {
  if (call.name !== ASK_QUESTIONS) {
    return null;
  }
  const raw = call.args['questions'];
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const questions: AssistantQuestion[] = [];
  for (const item of raw) {
    const question = parseQuestion(item);
    if (question === null) {
      return null;
    }
    questions.push(question);
  }
  return questions;
}

/**
 * Questions restées sans réponse à la fin d'une conversation rechargée : le
 * dernier message (hors tours `tool`) est un assistant dont un appel
 * `ask_questions` n'a pas de tour `tool` apparié parmi ceux qui le suivent —
 * le run figé attend peut-être encore (le back le dira : 404 s'il est perdu).
 * Les lectures du même round, résolues, et les appels bloquants écartés par
 * la garde du back (tour `tool` en échec) ne comptent pas.
 */
export function pendingQuestionsFromHistory(
  messages: readonly AssistantMessage[],
): { id: string; questions: AssistantQuestion[] } | null {
  let index = messages.length - 1;
  const answered = new Set<string>();
  while (index >= 0 && messages[index].role === 'tool') {
    const toolCallId = messages[index].tool_call_id;
    if (toolCallId) {
      answered.add(toolCallId);
    }
    index -= 1;
  }
  const last = index >= 0 ? messages[index] : null;
  if (last === null || last.role !== 'assistant') {
    return null;
  }
  for (const call of last.tool_calls) {
    if (call.name !== ASK_QUESTIONS || answered.has(call.id)) {
      continue;
    }
    const questions = parseQuestions({ id: call.id, name: call.name, args: call.arguments ?? {} });
    if (questions !== null) {
      return { id: call.id, questions };
    }
  }
  return null;
}

export function emptyDraft(): QuestionDraft {
  return { selected: [], otherChecked: false, otherText: '' };
}

/**
 * Suggestion cliquée : en choix unique elle devient LA réponse (« Autre »
 * décoché, son texte conservé) ; en choix multiple elle est cochée ou
 * décochée.
 */
export function selectOption(
  draft: QuestionDraft,
  question: AssistantQuestion,
  index: number,
): QuestionDraft {
  if (!question.multiSelect) {
    return { ...draft, selected: [index], otherChecked: false };
  }
  const selected = draft.selected.includes(index)
    ? draft.selected.filter((value) => value !== index)
    : [...draft.selected, index].sort((a, b) => a - b);
  return { ...draft, selected };
}

/** « Autre » coché ou décoché — en choix unique, le cocher remplace la suggestion choisie. */
export function setOtherChecked(
  draft: QuestionDraft,
  question: AssistantQuestion,
  checked: boolean,
): QuestionDraft {
  if (checked && !question.multiSelect) {
    return { ...draft, selected: [], otherChecked: true };
  }
  return { ...draft, otherChecked: checked };
}

/** Saisie dans « Autre » : un texte non vide coche « Autre ». */
export function typeOther(
  draft: QuestionDraft,
  question: AssistantQuestion,
  text: string,
): QuestionDraft {
  const next = { ...draft, otherText: text };
  return text.trim() ? setOtherChecked(next, question, true) : next;
}

/**
 * La question a sa réponse : une suggestion au moins, ou « Autre » coché — et
 * alors un texte non vide (« Autre » coché à vide n'est pas une réponse).
 */
export function isDraftAnswered(draft: QuestionDraft): boolean {
  if (draft.otherChecked && !draft.otherText.trim()) {
    return false;
  }
  return draft.selected.length > 0 || draft.otherChecked;
}

export function draftAnswer(draft: QuestionDraft): QuestionAnswer {
  const other = draft.otherChecked ? draft.otherText.trim() : '';
  return { selected: [...draft.selected], other: other || null };
}

/** Corps de la route de réponse (`QuestionAnswerCreate` côté back). */
export function questionsReplyBody(reply: QuestionsReply): {
  declined: boolean;
  answers: QuestionAnswer[] | null;
} {
  return reply.declined
    ? { declined: true, answers: null }
    : { declined: false, answers: reply.answers };
}
