import { collectExportStyles, EXPORT_PRINT_CSS, needsMathFonts } from './export-styles';

/** Feuille minimale : seul `cssRules` (et `href`) est lu par la collecte. */
function sheet(href: string | null, rules: string[], unreadable = false): CSSStyleSheet {
  return {
    href,
    get cssRules(): CSSRule[] {
      if (unreadable) {
        throw new DOMException('cross-origin');
      }
      return rules.map((cssText) => ({ cssText }) as CSSRule);
    },
  } as unknown as CSSStyleSheet;
}

function documentWith(sheets: CSSStyleSheet[]): Document {
  return { styleSheets: sheets, baseURI: 'https://oc.example/fr/courses/1' } as unknown as Document;
}

const noFonts = { inlineMathFonts: false, toDataUrl: async () => null };

describe('collectExportStyles', () => {
  it('keeps ordinary rules and appends the minimal print block', async () => {
    const css = await collectExportStyles(
      documentWith([sheet(null, ['.a { color: red }', '@media screen and (max-width: 640px) { .b { display: none } }'])]),
      noFonts,
    );

    expect(css).toContain('.a { color: red }');
    expect(css).toContain('@media screen and (max-width: 640px)');
    expect(css.endsWith(EXPORT_PRINT_CSS)).toBe(true);
  });

  it('drops the app print rules, which would blank the exported page', async () => {
    const css = await collectExportStyles(
      documentWith([
        sheet(null, ['@media print { body > *:not(#oc-print-root) { display: none } }']),
      ]),
      noFonts,
    );

    expect(css).not.toContain('oc-print-root');
  });

  it('resolves relative urls against the stylesheet', async () => {
    const css = await collectExportStyles(
      documentWith([
        sheet('https://oc.example/styles-abc.css', ['.a { background: url(media/dot.svg) }']),
      ]),
      noFonts,
    );

    expect(css).toContain('url(https://oc.example/media/dot.svg)');
  });

  it('drops interface font faces and keeps no KaTeX face without math', async () => {
    const css = await collectExportStyles(
      documentWith([
        sheet(null, [
          "@font-face { font-family: Inter; src: url(media/inter.woff2) format('woff2') }",
          "@font-face { font-family: KaTeX_Math; src: url(media/KaTeX_Math-Italic.woff2) format('woff2') }",
        ]),
      ]),
      noFonts,
    );

    expect(css).not.toContain('@font-face');
  });

  it('inlines the woff2 source of a KaTeX face when the content has math', async () => {
    const read: string[] = [];
    const css = await collectExportStyles(
      documentWith([
        sheet('https://oc.example/styles.css', [
          "@font-face { font-family: KaTeX_Math; src: url(media/KaTeX_Math-Italic.woff2) format('woff2'), url(media/KaTeX_Math-Italic.ttf) format('truetype'); font-style: italic }",
        ]),
      ]),
      {
        inlineMathFonts: true,
        toDataUrl: async (url) => {
          read.push(url);
          return 'data:font/woff2;base64,AAA';
        },
      },
    );

    expect(read).toEqual(['https://oc.example/media/KaTeX_Math-Italic.woff2']);
    expect(css).toContain("src: url(data:font/woff2;base64,AAA) format('woff2')");
    expect(css).not.toContain('truetype');
    expect(css).toContain('font-style: italic');
  });

  it('drops a KaTeX face whose file cannot be read, and ignores a cross-origin sheet', async () => {
    const css = await collectExportStyles(
      documentWith([
        sheet(null, ["@font-face { font-family: KaTeX_Main; src: url(k.woff2) format('woff2') }"]),
        sheet('https://cdn.example/x.css', ['.z { color: blue }'], true),
      ]),
      { inlineMathFonts: true, toDataUrl: async () => null },
    );

    expect(css).not.toContain('@font-face');
    expect(css).not.toContain('.z');
  });
});

describe('needsMathFonts', () => {
  it('detects rendered KaTeX in the clone', () => {
    const el = document.createElement('div');
    expect(needsMathFonts(el)).toBe(false);

    el.innerHTML = '<span class="katex"><span class="katex-mathml">x</span></span>';
    expect(needsMathFonts(el)).toBe(true);
  });
});
