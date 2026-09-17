import { childrenOf, parseDelegation } from './delegation';
import { AssistantToolActivity } from './turn-reducer';

const BLOCK = '11111111-1111-4111-8111-111111111111';
const MODULE = '22222222-2222-4222-8222-222222222222';

describe('parseDelegation', () => {
  it('parses a block delegation from the rewritten args', () => {
    expect(
      parseDelegation({
        id: 'call_d',
        name: 'edit_block',
        args: {
          target_ref: 'B1',
          instructions: 'Réécris.',
          block_id: BLOCK,
          context: 'block_exercise',
          target_title: 'Exercice 1',
        },
      }),
    ).toEqual({
      id: 'call_d',
      context: 'block_exercise',
      targetId: BLOCK,
      targetTitle: 'Exercice 1',
      instructions: 'Réécris.',
    });
  });

  it('parses a module delegation (module_id), title optional', () => {
    expect(
      parseDelegation({
        id: 'call_m',
        name: 'edit_module',
        args: {
          target_ref: 'M1',
          instructions: 'Un bouton.',
          module_id: MODULE,
          context: 'module',
        },
      }),
    ).toEqual({
      id: 'call_m',
      context: 'module',
      targetId: MODULE,
      targetTitle: '',
      instructions: 'Un bouton.',
    });
  });

  it('rejects other tools, unrewritten args, unknown contexts and non-UUID targets', () => {
    expect(parseDelegation({ id: 'c', name: 'read_block', args: { block_id: BLOCK } })).toBeNull();
    // Appel refusé par le back (cible irrésolue) : args non réécrits.
    expect(
      parseDelegation({
        id: 'c',
        name: 'edit_block',
        args: { target_ref: 'B9', instructions: 'x' },
      }),
    ).toBeNull();
    expect(
      parseDelegation({
        id: 'c',
        name: 'edit_block',
        args: { instructions: 'x', block_id: BLOCK, context: 'course' },
      }),
    ).toBeNull();
    expect(
      parseDelegation({
        id: 'c',
        name: 'edit_block',
        args: { instructions: 'x', block_id: '../evil', context: 'block_text' },
      }),
    ).toBeNull();
    expect(
      parseDelegation({
        id: 'c',
        name: 'edit_module',
        args: { instructions: 'x', block_id: BLOCK, context: 'module' },
      }),
    ).toBeNull();
  });
});

describe('childrenOf', () => {
  it('keeps the activity of one sub-assistant, in stream order', () => {
    const activity: AssistantToolActivity[] = [
      { id: 'call_d', name: 'edit_block', status: 'running', args: {}, result: null },
      { id: 'c1', name: 'read_block', status: 'done', args: {}, result: 'x', agent: 'call_d' },
      { id: 'c2', name: 'read_block', status: 'done', args: {}, result: 'y', agent: 'call_e' },
      {
        id: 'c3',
        name: 'propose_block_edit',
        status: 'running',
        args: {},
        result: null,
        agent: 'call_d',
      },
    ];
    expect(childrenOf(activity, 'call_d').map((e) => e.id)).toEqual(['c1', 'c3']);
    expect(childrenOf(activity, 'call_x')).toEqual([]);
  });
});
