import en from '../../i18n/en';
import { resolveCalloutTitles } from './course-callouts';
import { buildColumnsMarkdown, columnsStart, splitColumns } from './course-columns';
import { renderCourseMarkdown } from './course-markdown';

/** Rend dans un div jsdom pour interroger le DOM produit. */
function render(markdown: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = renderCourseMarkdown(markdown);
  return div;
}

const columnsOf = (container: Element | null): Element[] => [
  ...(container?.querySelectorAll(':scope > .course-columns__column') ?? []),
];

describe('splitColumns', () => {
  it('splits a container into its two columns, consumed up to its closing line', () => {
    expect(splitColumns('::: columns\nGauche\n+++\nDroite\n:::\nAprès')).toEqual({
      raw: '::: columns\nGauche\n+++\nDroite\n:::\n',
      ratio: '1:1',
      left: 'Gauche',
      right: 'Droite',
    });
    expect(splitColumns('::: columns\nA\n+++\nB\n:::')?.raw).toBe('::: columns\nA\n+++\nB\n:::');
  });

  it('keeps each column as multi-line markdown', () => {
    const parts = splitColumns(
      '::: columns\n> [!DEFINITION]\n> Texte\n\nSuite\n+++\n- a\n- b\n:::\n',
    );
    expect(parts?.left).toBe('> [!DEFINITION]\n> Texte\n\nSuite');
    expect(parts?.right).toBe('- a\n- b');
  });

  it('reads the optional ratio; equal columns by default or when explicit', () => {
    expect(splitColumns('::: columns 1:2\nA\n+++\nB\n:::')?.ratio).toBe('1:2');
    expect(splitColumns('::: columns 2:1\nA\n+++\nB\n:::')?.ratio).toBe('2:1');
    expect(splitColumns('::: columns 1:1\nA\n+++\nB\n:::')?.ratio).toBe('1:1');
  });

  it('tolerates case, up to 3 spaces of indentation, longer markers and trailing blanks', () => {
    for (const markdown of [
      '::: COLUMNS\nA\n+++\nB\n:::',
      ':::columns\nA\n+++\nB\n:::',
      '   ::: columns\nA\n   +++\nB\n   :::',
      ':::: columns \t\nA\n++++  \nB\n::::\t',
      '::: columns\t2:1\nA\n+++\nB\n:::',
    ]) {
      expect(splitColumns(markdown), markdown).not.toBeNull();
    }
  });

  it('recognizes nothing but a well-formed container at the head of the source', () => {
    for (const markdown of [
      'Texte\n::: columns\nA\n+++\nB\n:::',
      '    ::: columns\nA\n+++\nB\n:::',
      '\t::: columns\nA\n+++\nB\n:::',
      ':: columns\nA\n+++\nB\n:::',
      '::: columnsx\nA\n+++\nB\n:::',
      '::: columns 3:1\nA\n+++\nB\n:::',
      '::: columns 1 : 2\nA\n+++\nB\n:::',
      '::: columns 1:2 large\nA\n+++\nB\n:::',
      '::: columns\nA\nB\n:::',
      '::: columns\nA\n+++\nB\n+++\nC\n:::',
      '::: columns\nA\n+++ suite\nB\n:::',
      '::: columns\nA\n    +++\nB\n:::',
      '::: columns\nA\n+++\nB',
      '::: columns\nA\n+++\nB\n::: fin',
    ]) {
      expect(splitColumns(markdown), markdown).toBeNull();
    }
  });

  it('ignores markers inside fenced code, delimited as marked does', () => {
    const fenced = splitColumns(
      '::: columns\n```python\n+++\n:::\n```\n+++\n~~~\n:::\n+++\n~~~\n:::',
    );
    expect(fenced?.left).toBe('```python\n+++\n:::\n```');
    expect(fenced?.right).toBe('~~~\n:::\n+++\n~~~');
    // Fence de 4 backticks : un ``` intérieur ne le ferme pas.
    const long = splitColumns('::: columns\n````\n```\n+++\n```\n````\n+++\nB\n:::');
    expect(long?.left).toBe('````\n```\n+++\n```\n````');
    // Fence jamais fermé : il court jusqu'à la fin, plus aucun marqueur n'est vu.
    expect(splitColumns('::: columns\nA\n+++\n```\nB\n:::')).toBeNull();
  });

  it('keeps a nested container whole: its markers belong to it', () => {
    const parts = splitColumns('::: columns\n::: columns 1:2\na\n+++\nb\n:::\n+++\nB\n:::');
    expect(parts?.left).toBe('::: columns 1:2\na\n+++\nb\n:::');
    expect(parts?.right).toBe('B');
    // Tout `:::` suivi de texte ouvre un niveau (divs à la Pandoc).
    expect(splitColumns('::: columns\n::: note\n+++\n:::\n+++\nB\n:::')?.left).toBe(
      '::: note\n+++\n:::',
    );
    expect(splitColumns('::: columns\n::: note\nA\n+++\nB\n:::')).toBeNull();
  });

  it('allows empty columns', () => {
    expect(splitColumns('::: columns\n+++\n:::')).toEqual({
      raw: '::: columns\n+++\n:::',
      ratio: '1:1',
      left: '',
      right: '',
    });
    expect(splitColumns('::: columns\nA\n+++\n:::\n')?.right).toBe('');
  });
});

describe('columnsStart', () => {
  it('points at a candidate opener at the start of a line, even an invalid one', () => {
    expect(columnsStart('ntro\n::: columns\nA')).toBe(5);
    expect(columnsStart('ntro\n  :::: COLUMNS 3:1')).toBe(5);
  });

  it('never points inside a line nor at the start of the slice', () => {
    expect(columnsStart('Voir ::: columns')).toBeUndefined();
    expect(columnsStart('::: columns\nA')).toBeUndefined();
    expect(columnsStart('Texte\n+++')).toBeUndefined();
  });
});

describe('buildColumnsMarkdown', () => {
  const placeholders = { left: 'Colonne de gauche', right: 'Colonne de droite' };

  it('inserts a container between blank lines and selects the left placeholder', () => {
    const snippet = buildColumnsMarkdown('', placeholders);
    expect(snippet.text).toBe(
      '\n\n::: columns\nColonne de gauche\n+++\nColonne de droite\n:::\n\n',
    );
    expect(snippet.text.slice(snippet.select.start, snippet.select.end)).toBe('Colonne de gauche');
  });

  it('turns the selection into the left column and selects the right placeholder', () => {
    const snippet = buildColumnsMarkdown('\n  \n  - point\nsuite\n\n', placeholders);
    expect(snippet.text).toBe('\n\n::: columns\n  - point\nsuite\n+++\nColonne de droite\n:::\n\n');
    expect(snippet.text.slice(snippet.select.start, snippet.select.end)).toBe('Colonne de droite');
  });

  it('normalizes CRLF and treats a blank selection as none', () => {
    expect(buildColumnsMarkdown('a\r\nb', placeholders).text).toContain('::: columns\na\nb\n+++');
    expect(buildColumnsMarkdown(' \n\t', placeholders).text).toContain(
      '::: columns\nColonne de gauche\n',
    );
  });

  it('produces a container that splitColumns reads back', () => {
    const { text } = buildColumnsMarkdown('Ma définition', placeholders);
    expect(splitColumns(text.trimStart())).toMatchObject({
      left: 'Ma définition',
      right: 'Colonne de droite',
    });
  });
});

describe('renderCourseMarkdown — columns', () => {
  it('renders two columns in order, each as full markdown, markers gone', () => {
    const el = render('::: columns\n**Gauche** $x^2$\n+++\nDroite\n:::');
    const [left, right, ...rest] = columnsOf(el.querySelector(':scope > div.course-columns'));
    expect(rest).toEqual([]);
    expect(left.querySelector('strong')?.textContent).toBe('Gauche');
    expect(left.querySelector('.katex')).not.toBeNull();
    expect(right.querySelector('p')?.textContent).toBe('Droite');
    expect(el.textContent).not.toContain(':::');
    expect(el.textContent).not.toContain('+++');
  });

  it('marks the ratio with a modifier class, none for equal columns', () => {
    const className = (markdown: string) => render(markdown).querySelector('div')?.className;
    expect(className('::: columns 1:2\nA\n+++\nB\n:::')).toBe('course-columns course-columns--1-2');
    expect(className('::: columns 2:1\nA\n+++\nB\n:::')).toBe('course-columns course-columns--2-1');
    expect(className('::: columns\nA\n+++\nB\n:::')).toBe('course-columns');
    expect(className('::: columns 1:1\nA\n+++\nB\n:::')).toBe('course-columns');
  });

  it('a column holds anything course markdown renders', () => {
    const el = render(
      [
        '::: columns',
        '> [!DEFINITION] Nombre premier',
        '> Un entier naturel qui a exactement deux diviseurs.',
        '',
        '$$p > 1$$',
        '',
        '1. un',
        '2. deux',
        '+++',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '```python',
        'print(13 % 2)',
        '```',
        '',
        '[Simulation](oc-module:7c9e6a2b-4d3f-4a58-9b1e-2f5c8d0a6b34)',
        '',
        '![Schéma](oc-resource:5d0c7a4e-8f5b-4b2a-9c1d-3e6f7a8b9c0d)',
        ':::',
      ].join('\n'),
    );
    const [left, right] = columnsOf(el.querySelector('.course-columns'));
    expect(left.querySelector('.course-callout--definition')).not.toBeNull();
    expect(left.querySelector('.katex-display')).not.toBeNull();
    expect(left.querySelectorAll('ol > li')).toHaveLength(2);
    expect(right.querySelector('.course-table table')).not.toBeNull();
    expect(right.querySelector('pre > code.language-python')?.textContent).toBe('print(13 % 2)\n');
    expect(right.querySelector('[data-oc-module-id]')).not.toBeNull();
    expect(right.querySelector('[data-oc-resource-id]')).not.toBeNull();
  });

  it('a paragraph glued above or below a container stays a paragraph', () => {
    const el = render('Avant\n::: columns\nA\n+++\nB\n:::\nAprès');
    expect([...el.children].map((child) => child.tagName)).toEqual(['P', 'DIV', 'P']);
    expect(el.firstElementChild?.textContent).toBe('Avant');
    expect(el.lastElementChild?.textContent).toBe('Après');
  });

  it('containers nest in a list item, a callout or a column', () => {
    expect(
      render('- Point\n\n  ::: columns\n  A\n  +++\n  B\n  :::').querySelector(
        'li .course-columns',
      ),
    ).not.toBeNull();
    expect(
      render('> [!EXAMPLE]\n> ::: columns\n> A\n> +++\n> B\n> :::').querySelector(
        '.course-callout--example .course-columns',
      ),
    ).not.toBeNull();
    expect(
      render('::: columns\n::: columns\na\n+++\nb\n:::\n+++\nB\n:::').querySelector(
        '.course-columns__column > .course-columns',
      ),
    ).not.toBeNull();
  });

  it('an opener glued to a quote or a table joins it; a blank line keeps them apart', () => {
    // Continuation paresseuse : la citation absorbe le conteneur.
    const quoted = render('> Citation\n::: columns\nA\n+++\nB\n:::');
    expect(quoted.querySelector(':scope > .course-columns')).toBeNull();
    expect(quoted.querySelector('blockquote .course-columns')).not.toBeNull();
    // Le tableau en fait des rangées.
    const tabled = render('| a |\n|---|\n| 1 |\n::: columns\nA\n+++\nB\n:::');
    expect(tabled.querySelector('.course-columns')).toBeNull();
    for (const before of ['> Citation', '| a |\n|---|\n| 1 |', '- item']) {
      const apart = render(`${before}\n\n::: columns\nA\n+++\nB\n:::`);
      expect(apart.querySelector(':scope > .course-columns'), before).not.toBeNull();
    }
  });

  it('a container in a tight list item leaves the rest of the item as it was', () => {
    const el = render('- ::: columns\n  A\n  +++\n  B\n  :::\n  suite\n- autre');
    const item = el.querySelector('li');
    expect(item?.querySelector(':scope > .course-columns')).not.toBeNull();
    expect(item?.querySelector(':scope > p')).toBeNull();
    expect(item?.textContent).toContain('suite');
  });

  it('anything malformed stays text, markers visible', () => {
    for (const markdown of [
      '::: columns\nA\n+++\nB',
      '::: columns 3:1\nA\n+++\nB\n:::',
      '::: columns\nA\n+++\nB\n+++\nC\n:::',
    ]) {
      const el = render(markdown);
      expect(el.querySelector('.course-columns'), markdown).toBeNull();
      expect(el.textContent).toContain('::: columns');
    }
  });

  it('an invalid opener glued under a paragraph stays inside that paragraph', () => {
    for (const markdown of ['Intro\n::::: columns\nsans séparateur', 'Intro\n ::: columns\nx']) {
      const el = render(markdown);
      expect(el.querySelectorAll('p'), markdown).toHaveLength(1);
      expect(el.querySelector('p')?.textContent).toBe(markdown);
    }
  });

  it('markers in fenced or indented code stay code', () => {
    const fenced = render('```python\n::: columns\n+++\n:::\n```');
    expect(fenced.querySelector('.course-columns')).toBeNull();
    expect(fenced.querySelector('pre > code')?.textContent).toContain('+++');
    const indented = render('    ::: columns\n    A\n    +++\n    B\n    :::');
    expect(indented.querySelector('.course-columns')).toBeNull();
    expect(indented.querySelector('pre > code')).not.toBeNull();
  });

  it('renders a CRLF source', () => {
    expect(
      render('::: columns\r\nA\r\n+++\r\nB\r\n:::\r\n').querySelector('.course-columns'),
    ).not.toBeNull();
  });

  it('column content is sanitized with the rest of the block', () => {
    const el = render('::: columns\n<img src="x" onerror="alert(1)">\n+++\nB\n:::');
    expect(el.querySelector('.course-columns')).not.toBeNull();
    expect(el.innerHTML).not.toContain('onerror');
  });

  it('callout titles given by the caller apply inside columns', () => {
    const div = document.createElement('div');
    div.innerHTML = renderCourseMarkdown('::: columns\n> [!EXAMPLE]\n> x\n+++\nB\n:::', {
      calloutTitles: resolveCalloutTitles(en.markdownView.callouts),
    });
    expect(div.querySelector('.course-columns .course-callout__title')?.textContent).toBe(
      'Example',
    );
  });
});
