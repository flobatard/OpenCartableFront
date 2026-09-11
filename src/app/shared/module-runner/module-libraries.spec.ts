import { MODULE_LIBRARIES, parseModuleLibraries } from './module-libraries';

const names = (js: string): string[] =>
  parseModuleLibraries(js).libraries.map((library) => library.name);

describe('parseModuleLibraries', () => {
  it('declares nothing without a pragma', () => {
    expect(parseModuleLibraries('const Matter = 1; // matter\nnew Chart();')).toEqual({
      libraries: [],
      unknown: [],
    });
  });

  it('reads a comma- or space-separated pragma, case-insensitively', () => {
    expect(names('// @oc-libs: matter, Chart\nconsole.log(1);')).toEqual(['matter', 'chart']);
    expect(names('  //@oc-libs:p5   three')).toEqual(['p5', 'three']);
  });

  it('merges several pragma lines, deduplicated, in catalogue order', () => {
    expect(names('// @oc-libs: three, d3\nlet a;\n// @oc-libs: matter d3')).toEqual([
      'matter',
      'd3',
      'three',
    ]);
  });

  it('reports unknown names without loading them', () => {
    expect(parseModuleLibraries('// @oc-libs: matter, jquery, lodash')).toEqual({
      libraries: [MODULE_LIBRARIES[0]],
      unknown: ['jquery', 'lodash'],
    });
  });

  it('ignores a pragma that is not a line comment of its own', () => {
    expect(names("const s = '// @oc-libs: matter';")).toEqual([]);
    expect(names('/* @oc-libs: matter */')).toEqual([]);
  });

  it('ships a JS file (and the JSXGraph stylesheet) for every catalogue entry', () => {
    for (const library of MODULE_LIBRARIES) {
      expect(library.js).toBe(`${library.name}.js`);
    }
    expect(MODULE_LIBRARIES.find((library) => library.name === 'jsxgraph')?.css).toBe(
      'jsxgraph.css',
    );
  });
});
