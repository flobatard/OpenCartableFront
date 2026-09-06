import { AssistantMessage, AssistantUsage } from './assistant.model';

/**
 * Fonctions PURES du comptage de tokens du chat : addition des usages relayés
 * par le flux (`interrupt`(s) puis `done` d'un même tour — jamais recouvrants,
 * la reprise HITL repart de zéro côté back), sommes par tour et par
 * conversation sur les messages persistés, formatage localisé.
 */

/** Totaux d'un tour ou d'une conversation (par champ, inconnu vaut 0). */
export interface TokenTotals {
  input: number;
  output: number;
  total: number;
}

/** Vrai si au moins un des deux compteurs est connu. */
function known(usage: AssistantUsage | null | undefined): usage is AssistantUsage {
  return (
    usage !== null &&
    usage !== undefined &&
    (usage.input_tokens !== null || usage.output_tokens !== null)
  );
}

/** Copie des seuls compteurs (un message est structurellement un usage). */
function pick(usage: AssistantUsage): AssistantUsage {
  return { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens };
}

function sumField(a: number | null, b: number | null): number | null {
  if (a === null && b === null) {
    return null;
  }
  return (a ?? 0) + (b ?? 0);
}

/**
 * Additionne deux usages (`null`/`undefined` = inconnu) : `null` si aucun
 * n'est connu, sinon par champ la somme des valeurs connues (un champ nul
 * face à une valeur compte 0).
 */
export function addUsage(
  a: AssistantUsage | null | undefined,
  b: AssistantUsage | null | undefined,
): AssistantUsage | null {
  if (!known(a)) {
    return known(b) ? pick(b) : null;
  }
  if (!known(b)) {
    return pick(a);
  }
  return {
    input_tokens: sumField(a.input_tokens, b.input_tokens),
    output_tokens: sumField(a.output_tokens, b.output_tokens),
  };
}

function totals(usage: AssistantUsage): TokenTotals {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return { input, output, total: input + output };
}

/** Somme d'une liste d'usages ; `null` si aucun n'est connu. */
export function sumUsage(rows: readonly (AssistantUsage | null)[]): TokenTotals | null {
  const sum = rows.reduce<AssistantUsage | null>((acc, row) => addUsage(acc, row), null);
  return sum === null ? null : totals(sum);
}

/**
 * Usage par TOUR : un tour commence à chaque message `user` et somme les
 * lignes `assistant` qui le suivent (les tours `tool` n'en portent jamais).
 * Un tour HITL rechargé compte plusieurs segments assistant — un par appel
 * provider — là où le tour live n'en replie qu'un : même somme. Clé = id du
 * DERNIER message assistant du tour (là où le fil affiche la ligne) ; pas
 * d'entrée sans usage connu (provider muet).
 */
export function turnUsageByMessage(
  messages: readonly AssistantMessage[],
): ReadonlyMap<string, TokenTotals> {
  const result = new Map<string, TokenTotals>();
  let acc: AssistantUsage | null = null;
  let lastAssistantId: string | null = null;
  const flush = (): void => {
    if (lastAssistantId !== null && acc !== null) {
      result.set(lastAssistantId, totals(acc));
    }
    acc = null;
    lastAssistantId = null;
  };
  for (const message of messages) {
    if (message.role === 'user') {
      flush();
    } else if (message.role === 'assistant') {
      lastAssistantId = message.id;
      acc = addUsage(acc, message);
    }
  }
  flush();
  return result;
}

/** Total de la conversation (lignes `assistant` seulement) ; `null` sans usage connu. */
export function conversationUsage(messages: readonly AssistantMessage[]): TokenTotals | null {
  return sumUsage(messages.filter((message) => message.role === 'assistant'));
}

/**
 * Entier formaté dans la langue de l'UI (pas de `DecimalPipe` : la locale fr
 * n'est pas enregistrée — même raison que les dates du chat).
 */
export function formatTokenCount(value: number, lang: string): string {
  return new Intl.NumberFormat(lang).format(value);
}
