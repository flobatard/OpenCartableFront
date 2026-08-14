import { describe, expect, it } from 'vitest';
import { parseTikzConfig } from './tikz-config';

describe('parseTikzConfig', () => {
  it('retourne un environnement vide pour une source vide', () => {
    expect(parseTikzConfig('   \n  ')).toBe('\\begin{tikzpicture}\n\\end{tikzpicture}');
  });

  it('enveloppe des commandes nues dans un tikzpicture', () => {
    expect(parseTikzConfig('\\draw (0,0) -- (1,1);')).toBe(
      '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
    );
  });

  it("laisse intact un environnement déjà explicité (options comprises)", () => {
    const source = '\\begin{tikzpicture}[scale=1.5]\n\\draw (0,0) circle (1cm);\n\\end{tikzpicture}';
    expect(parseTikzConfig(source)).toBe(source);
  });

  it('trim la source avant analyse', () => {
    const source = '\n\\begin{tikzpicture}\n\\end{tikzpicture}\n';
    expect(parseTikzConfig(source)).toBe(source.trim());
  });
});
