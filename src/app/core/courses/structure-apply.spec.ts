import { orderWithInsert, reorderTarget } from './structure-apply';

describe('structure-apply', () => {
  it('inserts the new block right after its anchor', () => {
    expect(orderWithInsert(['a', 'b', 'c', 'n'], 'n', 'a')).toEqual(['a', 'n', 'b', 'c']);
    expect(orderWithInsert(['a', 'b', 'n'], 'n', 'b')).toEqual(['a', 'b', 'n']);
    // Le nouveau bloc peut ne pas figurer dans la liste courante.
    expect(orderWithInsert(['a', 'b'], 'n', 'a')).toEqual(['a', 'n', 'b']);
  });

  it('returns null when the anchor is gone', () => {
    expect(orderWithInsert(['a', 'b', 'n'], 'n', 'z')).toBeNull();
  });

  it('accepts only an exact permutation of the current blocks', () => {
    expect(reorderTarget(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
    expect(reorderTarget(['a', 'b', 'c'], ['c', 'a'])).toBeNull();
    expect(reorderTarget(['a', 'b'], ['a', 'b', 'c'])).toBeNull();
    expect(reorderTarget(['a', 'b', 'c'], ['a', 'a', 'b'])).toBeNull();
    expect(reorderTarget(['a', 'b', 'c'], ['a', 'b', 'z'])).toBeNull();
  });
});
