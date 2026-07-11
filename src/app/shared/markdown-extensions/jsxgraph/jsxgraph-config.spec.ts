import { describe, expect, it } from 'vitest';
import { parseJsxgraphConfig } from './jsxgraph-config';

describe('parseJsxgraphConfig', () => {
  it('parse équations (répétables), points et bbox', () => {
    const config = parseJsxgraphConfig(
      'equation="x^2 + 2*x - 3"\nequation="sin(x)"\npoint="2,2"\npoint=-1,0.5\nbbox="-10,10,10,-10"',
    );
    expect(config.equations).toEqual(['x^2 + 2*x - 3', 'sin(x)']);
    expect(config.points).toEqual([
      [2, 2],
      [-1, 0.5],
    ]);
    expect(config.boundingBox).toEqual([-10, 10, 10, -10]);
  });

  it('applique la bbox par défaut sans bbox ou avec une bbox malformée', () => {
    expect(parseJsxgraphConfig('equation=x').boundingBox).toEqual([-5, 5, 5, -5]);
    expect(parseJsxgraphConfig('bbox=1,2,3').boundingBox).toEqual([-5, 5, 5, -5]);
    expect(parseJsxgraphConfig('bbox=a,b,c,d').boundingBox).toEqual([-5, 5, 5, -5]);
  });

  it('ignore les points malformés et les équations vides', () => {
    const config = parseJsxgraphConfig('point=abc\npoint=1\npoint=1,2,3\nequation=""\npoint=3,4');
    expect(config.points).toEqual([[3, 4]]);
    expect(config.equations).toEqual([]);
  });

  it('rend une config vide pour une source vide', () => {
    expect(parseJsxgraphConfig('')).toEqual({
      equations: [],
      points: [],
      boundingBox: [-5, 5, 5, -5],
    });
  });
});
