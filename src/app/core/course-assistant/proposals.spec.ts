import {
  ALWAYS_REVIEWED_KINDS,
  isStructureProposal,
  MODULE_FILE_BY_KIND,
  parseProposal,
  PROPOSAL_TOOL_BY_KIND,
  PROPOSAL_TOOLS,
  PROPOSE_BLOCK_ADD,
  PROPOSE_BLOCK_DELETE,
  PROPOSE_BLOCK_EDIT,
  PROPOSE_BLOCKS_REORDER,
  PROPOSE_CSS_EDIT,
  PROPOSE_HTML_EDIT,
  PROPOSE_JS_EDIT,
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
      PROPOSE_HTML_EDIT,
      PROPOSE_CSS_EDIT,
      PROPOSE_JS_EDIT,
      PROPOSE_BLOCK_ADD,
      PROPOSE_BLOCK_DELETE,
      PROPOSE_BLOCKS_REORDER,
    ]);
    for (const tool of Object.values(PROPOSAL_TOOL_BY_KIND)) {
      expect(PROPOSAL_TOOLS.has(tool)).toBe(true);
    }
    // Chaque genre module désigne le fichier que l'éditeur doit appliquer.
    expect(MODULE_FILE_BY_KIND).toEqual({
      module_html: 'html',
      module_css: 'css',
      module_js: 'js',
    });
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
      parseProposal({
        id: 'c1',
        name: PROPOSE_BLOCK_EDIT,
        args: { new_markdown: '', summary: '' },
      }),
    ).toEqual({ kind: 'block_text', id: 'c1', summary: null, markdown: '' });
    expect(
      parseProposal({ id: 'c1', name: PROPOSE_BLOCK_EDIT, args: { new_markdown: 42 } }),
    ).toBeNull();
  });

  it('parses the structure proposals of the global assistant', () => {
    const added = parseProposal({
      id: 's1',
      name: PROPOSE_BLOCK_ADD,
      args: {
        type: 'document',
        title: ' Fiche ',
        description: '',
        summary: 'Ajout',
        after_id: 'b-1',
        resource_id: 'r-1',
        resource_name: 'fiche.pdf',
        module_id: null,
        module_title: null,
      },
    });
    expect(added).toEqual({
      kind: 'block_add',
      id: 's1',
      summary: 'Ajout',
      blockType: 'document',
      title: 'Fiche',
      description: null,
      afterId: 'b-1',
      resourceId: 'r-1',
      resourceName: 'fiche.pdf',
      moduleId: null,
      moduleTitle: null,
    });
    expect(added !== null && isStructureProposal(added)).toBe(true);
    expect(parseProposal({ id: 's1', name: PROPOSE_BLOCK_ADD, args: { type: 'quiz' } })).toBeNull();

    expect(
      parseProposal({
        id: 's2',
        name: PROPOSE_BLOCK_DELETE,
        args: { target_ref: 'B2', block_id: 'b-2', target_title: 'Bilan' },
      }),
    ).toEqual({
      kind: 'block_delete',
      id: 's2',
      summary: null,
      blockId: 'b-2',
      targetTitle: 'Bilan',
    });
    // Référence irrésolue côté back : pas d'id, donc pas de proposition.
    expect(
      parseProposal({ id: 's2', name: PROPOSE_BLOCK_DELETE, args: { target_ref: 'B9' } }),
    ).toBeNull();

    expect(
      parseProposal({
        id: 's3',
        name: PROPOSE_BLOCKS_REORDER,
        args: { order: ['B2', 'B1'], block_ids: ['b-2', 'b-1'] },
      }),
    ).toEqual({ kind: 'blocks_reorder', id: 's3', summary: null, blockIds: ['b-2', 'b-1'] });
    for (const block_ids of [undefined, [], ['b-1', 2]]) {
      expect(
        parseProposal({ id: 's3', name: PROPOSE_BLOCKS_REORDER, args: { block_ids } }),
      ).toBeNull();
    }
  });

  it('always reviews removals, of a question or of a block', () => {
    expect([...ALWAYS_REVIEWED_KINDS]).toEqual(['exercise_question_delete', 'block_delete']);
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
      parseProposal({
        id: 'c3',
        name: PROPOSE_QUESTION_EDIT,
        args: { question_ref: 'Q9', statement: 'x' },
      }),
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
    expect(
      parseProposal({ id: 'c4', name: PROPOSE_QUESTION_ADD, args: { after_id: 'q-1' } }),
    ).toBeNull();
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

  it('parses a module code proposal, one file per tool', () => {
    expect(
      parseProposal({
        id: 'c6',
        name: PROPOSE_JS_EDIT,
        args: { new_code: 'const x = 1;', summary: 'Compteur' },
      }),
    ).toEqual({ kind: 'module_js', id: 'c6', summary: 'Compteur', code: 'const x = 1;' });
    expect(
      parseProposal({ id: 'c6', name: PROPOSE_HTML_EDIT, args: { new_code: '<p>a</p>' } }),
    ).toEqual({ kind: 'module_html', id: 'c6', summary: null, code: '<p>a</p>' });
    // Vider un fichier est une proposition légitime.
    expect(parseProposal({ id: 'c6', name: PROPOSE_CSS_EDIT, args: { new_code: '' } })).toEqual({
      kind: 'module_css',
      id: 'c6',
      summary: null,
      code: '',
    });
    // Args malformés : aucune revue (repli sur la ligne d'outil générique).
    expect(parseProposal({ id: 'c6', name: PROPOSE_CSS_EDIT, args: {} })).toBeNull();
    expect(parseProposal({ id: 'c6', name: PROPOSE_JS_EDIT, args: { new_code: 42 } })).toBeNull();
  });

  it('ignores non-proposal tools', () => {
    expect(parseProposal({ id: 'r1', name: 'read_block', args: { block_ref: 'B1' } })).toBeNull();
  });
});
