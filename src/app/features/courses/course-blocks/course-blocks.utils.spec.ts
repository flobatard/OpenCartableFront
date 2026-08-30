import { CourseBlock } from '../../../core/courses/course.model';
import { blockExcerpt, moveId, moveIdTo } from './course-blocks.utils';

function block(type: CourseBlock['type'], content: Record<string, unknown>): CourseBlock {
  return {
    id: 'b1',
    position: 0,
    type,
    title: null,
    description: null,
    content,
    resource_id: null,
    module_id: null,
  };
}

describe('blockExcerpt', () => {
  it('extracts the content according to the block type', () => {
    expect(blockExcerpt(block('text', { markdown: 'Un cours magistral' }))).toBe(
      'Un cours magistral',
    );
    expect(blockExcerpt(block('exercise', { statement: 'Résoudre x²=4', questions: [] }))).toBe(
      'Résoudre x²=4',
    );
    expect(
      blockExcerpt(block('document', { caption: 'Le schéma du chapitre', display: 'inline' })),
    ).toBe('Le schéma du chapitre');
  });

  it('returns an empty string for a block without content or excerpt (module)', () => {
    expect(blockExcerpt(block('text', {}))).toBe('');
    expect(blockExcerpt(block('text', { markdown: '   ' }))).toBe('');
    expect(blockExcerpt(block('document', { caption: null, display: 'inline' }))).toBe('');
    expect(blockExcerpt(block('module', {}))).toBe('');
  });

  it('flattens whitespace and truncates to 80 characters with an ellipsis', () => {
    expect(blockExcerpt(block('text', { markdown: 'Un\ntitre\n\navec  retours' }))).toBe(
      'Un titre avec retours',
    );
    const long = blockExcerpt(block('text', { markdown: 'x'.repeat(120) }));
    expect(long).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('moveId', () => {
  const ids = ['a', 'b', 'c'];

  it('moves an id up or down', () => {
    expect(moveId(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op out of bounds or on an unknown id (unchanged copy)', () => {
    expect(moveId(ids, 'a', -1)).toEqual(ids);
    expect(moveId(ids, 'c', 1)).toEqual(ids);
    expect(moveId(ids, 'z', 1)).toEqual(ids);
  });

  it('always returns a new array', () => {
    expect(moveId(ids, 'b', -1)).not.toBe(ids);
    expect(moveId(ids, 'a', -1)).not.toBe(ids);
  });
});

describe('moveIdTo', () => {
  const ids = ['a', 'b', 'c'];

  it('moves an element from from to to', () => {
    expect(moveIdTo(ids, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveIdTo(ids, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveIdTo(ids, 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op out of bounds (unchanged copy)', () => {
    expect(moveIdTo(ids, -1, 0)).toEqual(ids);
    expect(moveIdTo(ids, 0, 3)).toEqual(ids);
    expect(moveIdTo(ids, 3, 0)).toEqual(ids);
  });

  it('always returns a new array', () => {
    expect(moveIdTo(ids, 0, 1)).not.toBe(ids);
    expect(moveIdTo(ids, -1, 0)).not.toBe(ids);
  });
});
