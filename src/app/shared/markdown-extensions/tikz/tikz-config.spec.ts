import { describe, expect, it } from 'vitest';
import { parseTikzConfig } from './tikz-config';

describe('parseTikzConfig', () => {
  it('returns an empty environment for an empty source', () => {
    expect(parseTikzConfig('   \n  ')).toBe('\\begin{tikzpicture}\n\\end{tikzpicture}');
  });

  it('wraps bare commands in a tikzpicture', () => {
    expect(parseTikzConfig('\\draw (0,0) -- (1,1);')).toBe(
      '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
    );
  });

  it("leaves an already explicit environment intact (options included)", () => {
    const source = '\\begin{tikzpicture}[scale=1.5]\n\\draw (0,0) circle (1cm);\n\\end{tikzpicture}';
    expect(parseTikzConfig(source)).toBe(source);
  });

  it('trims the source before parsing', () => {
    const source = '\n\\begin{tikzpicture}\n\\end{tikzpicture}\n';
    expect(parseTikzConfig(source)).toBe(source.trim());
  });
});
