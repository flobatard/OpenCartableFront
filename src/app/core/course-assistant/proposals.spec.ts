import {
  parseProposal,
  PROPOSAL_TOOL_BY_KIND,
  PROPOSAL_TOOLS,
  PROPOSE_BLOCK_EDIT,
  PROPOSE_QUESTION_ADD,
  PROPOSE_QUESTION_DELETE,
  PROPOSE_QUESTION_EDIT,
  PROPOSE_STATEMENT_EDIT,
} from './proposals';

/** Les args parsés sont ceux réécrits par le back (ids résolus, liens en UUID). */
describe('proposals', () => {
  it('knows every proposal tool, and maps each kind back to its tool', () => {
    expect([...PROPOSAL_TOOLS]).toEqual([
      PROPOSE_BLOCK_EDIT,
      PROPOSE_STATEMENT_EDIT,
      PROPOSE_QUESTION_EDIT,
      PROPOSE_QUESTION_ADD,
      PROPOSE_QUESTION_DELETE,
    ]);
    for (const tool of Object.values(PROPOSAL_TOOL_BY_KIND)) {
      expect(PROPOSAL_TOOLS.has(tool)).toBe(true);
    }
  });

  it('parses a block text rewrite (summary optional, empty summary → null)', () => {
    expect(
      parseProposal({
        id: 'c1',
        name: PROPOSE_BLOCK_EDIT,
        args: { new_markdown: '# Nouveau', summary: 'Réécriture' },
      }),
    ).toEqual({ kind: 'block_text', id: 'c1', summary: 'Réécriture', markdown: '# Nouveau' });
    expect(
      parseProposal({ id: 'c1', name: PROPOSE_BLOCK_EDIT, args: { new_markdown: '', summary: '' } }),
    ).toEqual({ kind: 'block_text', id: 'c1', summary: null, markdown: '' });
    expect(parseProposal({ id: 'c1', name: PROPOSE_BLOCK_EDIT, args: { new_markdown: 42 } })).toBeNull();
  });

  it('parses a statement edit', () => {
    expect(
      parseProposal({ id: 'c2', name: PROPOSE_STATEMENT_EDIT, args: { new_statement: 'Sujet' } }),
    ).toEqual({ kind: 'exercise_statement', id: 'c2', summary: null, statement: 'Sujet' });
    expect(parseProposal({ id: 'c2', name: PROPOSE_STATEMENT_EDIT, args: {} })).toBeNull();
  });

  it('parses a question edit from the resolved id, keeping untouched fields null', () => {
    expect(
      parseProposal({
        id: 'c3',
        name: PROPOSE_QUESTION_EDIT,
        args: { question_ref: 'Q2', question_id: 'q-2', expected_answer: '42', summary: 'Corrigé' },
      }),
    ).toEqual({
      kind: 'exercise_question_edit',
      id: 'c3',
      summary: 'Corrigé',
      questionId: 'q-2',
      statement: null,
      expectedAnswer: '42',
    });
    // Énoncé vide = valeur légitime (vider le champ), pas « non modifié ».
    expect(
      parseProposal({
        id: 'c3',
        name: PROPOSE_QUESTION_EDIT,
        args: { question_id: 'q-2', statement: '' },
      }),
    ).toMatchObject({ statement: '', expectedAnswer: null });
    // Sans id résolu (référence irrésolue côté back) ou sans aucun champ : rien à revoir.
    expect(
      parseProposal({ id: 'c3', name: PROPOSE_QUESTION_EDIT, args: { question_ref: 'Q9', statement: 'x' } }),
    ).toBeNull();
    expect(
      parseProposal({ id: 'c3', name: PROPOSE_QUESTION_EDIT, args: { question_id: 'q-2' } }),
    ).toBeNull();
  });

  it('parses a question add (answer defaults to empty, position optional)', () => {
    expect(
      parseProposal({
        id: 'c4',
        name: PROPOSE_QUESTION_ADD,
        args: { statement: 'Nouvelle ?', after_ref: 'Q1', after_id: 'q-1' },
      }),
    ).toEqual({
      kind: 'exercise_question_add',
      id: 'c4',
      summary: null,
      statement: 'Nouvelle ?',
      expectedAnswer: '',
      afterId: 'q-1',
    });
    expect(
      parseProposal({
        id: 'c4',
        name: PROPOSE_QUESTION_ADD,
        args: { statement: 'Nouvelle ?', expected_answer: 'Oui', after_id: null },
      }),
    ).toMatchObject({ expectedAnswer: 'Oui', afterId: null });
    expect(parseProposal({ id: 'c4', name: PROPOSE_QUESTION_ADD, args: { after_id: 'q-1' } })).toBeNull();
  });

  it('parses a question delete', () => {
    expect(
      parseProposal({
        id: 'c5',
        name: PROPOSE_QUESTION_DELETE,
        args: { question_ref: 'Q1', question_id: 'q-1' },
      }),
    ).toEqual({ kind: 'exercise_question_delete', id: 'c5', summary: null, questionId: 'q-1' });
    expect(
      parseProposal({ id: 'c5', name: PROPOSE_QUESTION_DELETE, args: { question_ref: 'Q9' } }),
    ).toBeNull();
  });

  it('ignores non-proposal tools', () => {
    expect(parseProposal({ id: 'r1', name: 'read_block', args: { block_ref: 'B1' } })).toBeNull();
  });
});
