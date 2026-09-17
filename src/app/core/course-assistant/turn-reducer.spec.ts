import {
  applyAgentToken,
  applyToolResult,
  AssistantToolActivity,
  foldTurnMessages,
  toolActivityFromCall,
} from './turn-reducer';

const DELEGATION: AssistantToolActivity = {
  id: 'call_d',
  name: 'edit_block',
  status: 'running',
  args: { target_ref: 'B1', instructions: 'x' },
  result: null,
};

describe('turn-reducer — sous-assistants (édition globale)', () => {
  it('toolActivityFromCall keeps the agent tag of a sub-assistant call', () => {
    const own = toolActivityFromCall({ type: 'tool_call', id: 'c1', name: 'read_block', args: {} });
    expect('agent' in own).toBe(false);

    const child = toolActivityFromCall({
      type: 'tool_call',
      id: 'c2',
      name: 'propose_block_edit',
      args: { new_markdown: '# V2' },
      agent: 'call_d',
    });
    expect(child.agent).toBe('call_d');
    expect(child.status).toBe('running');
  });

  it('applyAgentToken accumulates the sub-assistant text on its delegation entry', () => {
    let activity: AssistantToolActivity[] = [DELEGATION];
    activity = applyAgentToken(activity, 'call_d', 'Je lis. ');
    activity = applyAgentToken(activity, 'call_d', 'Je propose.');
    expect(activity[0].agentText).toBe('Je lis. Je propose.');
    // Délégation inconnue : rien ne change (contrat additif).
    expect(applyAgentToken(activity, 'call_x', 'oups')).toEqual(activity);
  });

  it('applyToolResult marks done or error on the matching entry only', () => {
    const activity = [DELEGATION, { ...DELEGATION, id: 'c2', name: 'read_block' }];
    const done = applyToolResult(activity, {
      type: 'tool_result',
      id: 'c2',
      name: 'read_block',
      is_error: false,
      excerpt: 'abc',
      length: 10,
    });
    expect(done[1]).toMatchObject({ status: 'done', result: 'abc…' });
    expect(done[0].status).toBe('running');

    const failed = applyToolResult(activity, {
      type: 'tool_result',
      id: 'c2',
      name: 'read_block',
      is_error: true,
      excerpt: 'nope',
      length: 4,
    });
    expect(failed[1]).toMatchObject({ status: 'error', result: 'nope' });
  });

  it('foldTurnMessages ignores the sub-assistant activity (never persisted by the back)', () => {
    const activity: AssistantToolActivity[] = [
      { ...DELEGATION, status: 'done', result: 'Sous-assistant terminé.', agentText: 'Fait.' },
      {
        id: 'call_c',
        name: 'propose_block_edit',
        status: 'done',
        args: { new_markdown: '# V2' },
        result: 'ACCEPTÉ',
        agent: 'call_d',
      },
    ];
    const messages = foldTurnMessages(activity, 'Parfait.', null);
    expect(messages.map((m) => [m.role, m.tool_call_id ?? null])).toEqual([
      ['tool', 'call_d'],
      ['assistant', null],
    ]);
    expect(messages[1].tool_calls?.map((call) => call.id)).toEqual(['call_d']);
    expect(messages[1].content).toBe('Parfait.');
  });

  it('foldTurnMessages yields nothing for a turn made only of sub-assistant activity', () => {
    const child: AssistantToolActivity = {
      id: 'call_c',
      name: 'read_block',
      status: 'done',
      args: {},
      result: 'x',
      agent: 'call_d',
    };
    expect(foldTurnMessages([child], '', null)).toEqual([]);
  });
});
