import { describe, expect, it } from 'vitest';
import { parseTikzConfig } from './tikz-config';

describe('parseTikzConfig', () => {
  it('returns an empty environment for an empty source', () => {
    expect(parseTikzConfig('   \n  ')).toEqual({
      code: '\\begin{tikzpicture}\n\\end{tikzpicture}',
      libraries: [],
    });
  });

  it('wraps bare commands in a tikzpicture', () => {
    expect(parseTikzConfig('\\draw (0,0) -- (1,1);').code).toBe(
      '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
    );
  });

  it("leaves an already explicit environment intact (options included)", () => {
    const source = '\\begin{tikzpicture}[scale=1.5]\n\\draw (0,0) circle (1cm);\n\\end{tikzpicture}';
    expect(parseTikzConfig(source).code).toBe(source);
  });

  it('trims the source before parsing', () => {
    const source = '\n\\begin{tikzpicture}\n\\end{tikzpicture}\n';
    expect(parseTikzConfig(source).code).toBe(source.trim());
  });

  it('hoists \\usetikzlibrary out of the code, before an explicit environment', () => {
    const config = parseTikzConfig(
      '\\usetikzlibrary{circuits.ee.IEC}\n\\begin{tikzpicture}[circuit ee IEC]\n\\draw (0,0) to [resistor] (3,0);\n\\end{tikzpicture}',
    );
    expect(config.libraries).toEqual(['circuits.ee.IEC']);
    expect(config.code).toBe(
      '\\begin{tikzpicture}[circuit ee IEC]\n\\draw (0,0) to [resistor] (3,0);\n\\end{tikzpicture}',
    );
  });

  it('hoists libraries of bare commands, which are then wrapped', () => {
    const config = parseTikzConfig('\\usetikzlibrary{arrows.meta}\n\\draw[-Stealth] (0,0) -- (1,0);');
    expect(config.libraries).toEqual(['arrows.meta']);
    expect(config.code).toBe('\\begin{tikzpicture}\n\\draw[-Stealth] (0,0) -- (1,0);\n\\end{tikzpicture}');
  });

  it('splits lists and dedupes across several calls', () => {
    const config = parseTikzConfig(
      '\\usetikzlibrary{ circuits.ee.IEC , arrows.meta }\n\\usetikzlibrary {circuits.ee.IEC}\n\\draw (0,0) -- (1,0);',
    );
    expect(config.libraries).toEqual(['circuits.ee.IEC', 'arrows.meta']);
    expect(config.code).not.toContain('usetikzlibrary');
  });

  it('leaves a commented-out call in the code', () => {
    const source = '% \\usetikzlibrary{circuits.ee.IEC}\n\\draw (0,0) -- (1,0);';
    const config = parseTikzConfig(source);
    expect(config.libraries).toEqual([]);
    expect(config.code).toContain('% \\usetikzlibrary{circuits.ee.IEC}');
  });

  it('never hoists anything but library names to the preamble', () => {
    const config = parseTikzConfig('\\usetikzlibrary{calc\\input x}\n\\draw (0,0) -- (1,0);');
    expect(config.libraries).toEqual([]);
    expect(config.code).toContain('\\usetikzlibrary{calc\\input x}');
  });
});
