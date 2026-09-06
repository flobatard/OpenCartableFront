import { AssistantMessage } from './assistant.model';
import { addUsage, conversationUsage, formatTokenCount, turnUsageByMessage } from './usage';

function message(
  partial: Partial<AssistantMessage> & Pick<AssistantMessage, 'id' | 'role'>,
): AssistantMessage {
  return {
    position: 0,
    content: '',
    tool_calls: [],
    tool_call_id: null,
    is_error: false,
    sources: {},
    input_tokens: null,
    output_tokens: null,
    created_at: '2026-09-06T10:00:00Z',
    ...partial,
  };
}

/**
 * Deux tours : le premier tel qu'une relecture le sert après un flux HITL
 * (segment porteur de la proposition, tour tool, segment final — chacun avec
 * l'usage de son appel), le second sans usage (provider muet).
 */
const THREAD: AssistantMessage[] = [
  message({ id: 'u1', role: 'user', content: 'Réécris ce bloc' }),
  message({
    id: 'a1',
    role: 'assistant',
    tool_calls: [{ id: 'c1', name: 'propose_block_edit', arguments: {} }],
    input_tokens: 120,
    output_tokens: 40,
  }),
  message({ id: 't1', role: 'tool', tool_call_id: 'c1', content: 'ACCEPTÉ' }),
  message({ id: 'a2', role: 'assistant', content: 'Voici.', input_tokens: 30, output_tokens: 10 }),
  message({ id: 'u2', role: 'user', content: 'Merci' }),
  message({ id: 'a3', role: 'assistant', content: 'De rien.' }),
];

describe('addUsage', () => {
  it('returns null when neither side is known', () => {
    expect(addUsage(null, null)).toBeNull();
    expect(addUsage(undefined, { input_tokens: null, output_tokens: null })).toBeNull();
  });

  it('keeps the only known side', () => {
    expect(addUsage(null, { input_tokens: 3, output_tokens: 2 })).toEqual({
      input_tokens: 3,
      output_tokens: 2,
    });
    expect(addUsage({ input_tokens: 3, output_tokens: 2 }, undefined)).toEqual({
      input_tokens: 3,
      output_tokens: 2,
    });
  });

  it('sums both sides (interrupt + done of a HITL turn)', () => {
    expect(
      addUsage({ input_tokens: 120, output_tokens: 40 }, { input_tokens: 30, output_tokens: 10 }),
    ).toEqual({ input_tokens: 150, output_tokens: 50 });
  });

  it('counts a null field as 0 when the other side knows it', () => {
    expect(
      addUsage({ input_tokens: 5, output_tokens: null }, { input_tokens: null, output_tokens: 7 }),
    ).toEqual({ input_tokens: 5, output_tokens: 7 });
  });
});

describe('turnUsageByMessage', () => {
  it('keys one entry per turn on its last assistant message, summing the segments', () => {
    const usage = turnUsageByMessage(THREAD);
    // Le second tour (sans usage) n'a pas d'entrée ; le tour tool ne compte pas.
    expect([...usage.keys()]).toEqual(['a2']);
    expect(usage.get('a2')).toEqual({ input: 150, output: 50, total: 200 });
  });

  it('keys a single-segment turn on that message', () => {
    const usage = turnUsageByMessage([
      message({ id: 'u1', role: 'user', content: 'Q' }),
      message({ id: 'a1', role: 'assistant', content: 'R', input_tokens: 7, output_tokens: 1 }),
    ]);
    expect(usage.get('a1')).toEqual({ input: 7, output: 1, total: 8 });
  });

  it('is empty for an empty thread', () => {
    expect(turnUsageByMessage([]).size).toBe(0);
  });
});

describe('conversationUsage', () => {
  it('sums every assistant row of the conversation', () => {
    expect(conversationUsage(THREAD)).toEqual({ input: 150, output: 50, total: 200 });
  });

  it('is null when no row carries usage', () => {
    expect(
      conversationUsage([
        message({ id: 'u1', role: 'user', content: 'Q' }),
        message({ id: 'a1', role: 'assistant', content: 'R' }),
      ]),
    ).toBeNull();
  });
});

describe('formatTokenCount', () => {
  it('formats in the UI language (fr uses a narrow no-break space)', () => {
    expect(formatTokenCount(1234, 'fr').replace(/\s/g, ' ')).toBe('1 234');
    expect(formatTokenCount(1234, 'en')).toBe('1,234');
    expect(formatTokenCount(87, 'fr')).toBe('87');
  });
});
