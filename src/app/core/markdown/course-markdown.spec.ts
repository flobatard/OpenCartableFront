import type { Mock } from 'vitest';
import mermaid from 'mermaid';
import {
  hasCourseDiagrams,
  hasCourseModules,
  hasCourseResources,
  mermaidSourceHasMath,
  renderCourseDiagrams,
  renderCourseMarkdown,
  resolveCourseResources,
} from './course-markdown';

// mermaid est importé dynamiquement par renderCourseDiagrams ; on le stubbe
// (le vrai rendu exige un DOM avec layout, indisponible en jsdom).
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

const mermaidRender = mermaid.render as unknown as Mock;
const mermaidInit = mermaid.initialize as unknown as Mock;

/** Rend dans un div jsdom pour interroger le DOM produit. */
function render(markdown: string): HTMLDivElement {
  const div = document.createElement('div');
  div.innerHTML = renderCourseMarkdown(markdown);
  return div;
}

describe('renderCourseMarkdown', () => {
  it('renders plain markdown as before (GFM)', () => {
    const div = render('## Section\n\nUn **paragraphe**.');
    expect(div.querySelector('h2')?.textContent).toBe('Section');
    expect(div.querySelector('strong')?.textContent).toBe('paragraphe');
    expect(div.querySelector('.katex')).toBeNull();
  });

  it('renders an inline $…$ formula without display mode', () => {
    const div = render('Soit $x^2$ un carré.');
    expect(div.querySelectorAll('.katex')).toHaveLength(1);
    expect(div.querySelector('.katex-display')).toBeNull();
  });

  it('renders $$…$$ as a centered formula (display)', () => {
    expect(render('$$\\int_0^1 x\\,dx$$').querySelector('.katex-display')).toBeTruthy();
    expect(render('$$\n\\frac{a}{b}\n$$').querySelector('.katex-display')).toBeTruthy();
  });

  it('a $$…$$ inside a paragraph is centered without breaking the paragraph', () => {
    const div = render('Avant $$y^2$$ après.');
    expect(div.querySelector('.katex-display')).toBeTruthy();
    expect(div.textContent).toContain('Avant');
    expect(div.textContent).toContain('après.');
  });

  it('KaTeX inline styles and MathML survive sanitization', () => {
    const html = renderCourseMarkdown('$x^2$');
    expect(html).toContain('style=');
    expect(html).toContain('<math');
    expect(html).toContain('<annotation');
  });

  it('strips scripts and event handlers', () => {
    const html = renderCourseMarkdown('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('an escaped \\$ stays a literal dollar', () => {
    const div = render('Ça coûte \\$5 et \\$10.');
    expect(div.querySelector('.katex')).toBeNull();
    expect(div.textContent).toContain('$5 et $10');
  });

  it('a lone $ or empty delimiters stay plain text', () => {
    expect(render('Un $ tout seul.').querySelector('.katex')).toBeNull();
    expect(render('$$$$').querySelector('.katex')).toBeNull();
    expect(render('$$ $$').querySelector('.katex')).toBeNull();
  });

  it('"10$ et 20$" (currency) is not interpreted as a formula', () => {
    expect(render('10$ et 20$').querySelector('.katex')).toBeNull();
    expect(render('prix $20 et $30').querySelector('.katex')).toBeNull();
  });

  it('invalid LaTeX: no exception, error rendered inline', () => {
    const div = render('$\\frac{$');
    expect(div.querySelector('.katex-error')).toBeTruthy();
  });

  it('formulas inside code are not rendered', () => {
    expect(render('`code $y$`').querySelector('.katex')).toBeNull();
    expect(render('```\n$x^2$\n```').querySelector('.katex')).toBeNull();
  });

  it('mixes inline and block formulas in the same document', () => {
    const div = render('Soit $x$ :\n\n$$\ny = x\n$$');
    expect(div.querySelectorAll('.katex')).toHaveLength(2);
    expect(div.querySelectorAll('.katex-display')).toHaveLength(1);
  });

  it('a ```mermaid block stays a source code block (synchronous fallback)', () => {
    const div = render('```mermaid\ngraph TD; A-->B\n```');
    expect(div.querySelector('code.language-mermaid')?.textContent).toContain('graph TD');
    expect(div.querySelector('svg')).toBeNull();
  });
});

describe('renderCourseDiagrams (Mermaid)', () => {
  const mermaidHtml = renderCourseMarkdown('```mermaid\ngraph TD; A-->B\n```');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects the presence of mermaid blocks', () => {
    expect(hasCourseDiagrams(mermaidHtml)).toBe(true);
    expect(hasCourseDiagrams(renderCourseMarkdown('## Titre'))).toBe(false);
  });

  it('replaces the source block with the rendered, sanitized SVG', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>A</text><script>alert(1)</script></svg>',
    });

    const out = await renderCourseDiagrams(mermaidHtml, 'light');

    expect(out).toContain('class="course-mermaid"');
    expect(out).toContain('<text>A</text>');
    expect(out).not.toContain('language-mermaid'); // source remplacée
    expect(out).not.toContain('<script'); // SVG repassé par DOMPurify
  });

  it('aligns the mermaid theme and forces SVG labels (never foreignObject)', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    await renderCourseDiagrams(mermaidHtml, 'dark');

    expect(mermaidInit).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'dark',
        securityLevel: 'strict',
        htmlLabels: false,
      }),
    );
  });

  it('invalid diagram: the source is kept in an error block', async () => {
    mermaidRender.mockRejectedValue(new Error('parse error'));

    const out = await renderCourseDiagrams(mermaidHtml, 'light');

    expect(out).toContain('course-mermaid--error');
    expect(out).toContain('graph TD');
  });

  it('invalid diagram: the label and the mermaid error message are shown', async () => {
    mermaidRender.mockRejectedValue(new Error('Parse error on line 2'));

    const out = await renderCourseDiagrams(mermaidHtml, 'light', undefined, 'Diagramme invalide :');

    expect(out).toContain('course-mermaid__error');
    expect(out).toContain('Diagramme invalide :');
    expect(out).toContain('Parse error on line 2');
  });

  it('invalid diagram without a provided label: no error caption', async () => {
    mermaidRender.mockRejectedValue(new Error('parse error'));

    const out = await renderCourseDiagrams(mermaidHtml, 'light');

    expect(out).not.toContain('course-mermaid__error');
  });

  it('without a mermaid block: HTML unchanged, mermaid never loaded', async () => {
    const html = renderCourseMarkdown('Juste du **texte**.');

    const out = await renderCourseDiagrams(html, 'light');

    expect(out).toBe(html);
    expect(mermaidRender).not.toHaveBeenCalled();
  });

  it('note: added when the source has LaTeX AND a note is provided', async () => {
    const src = renderCourseMarkdown('```mermaid\nflowchart LR\n  A["Courbe $y=x$"]\n```');
    mermaidRender.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    const out = await renderCourseDiagrams(src, 'light', 'Formules hors des nœuds.');

    expect(out).toContain('course-mermaid__note');
    expect(out).toContain('Formules hors des nœuds.');
  });

  it('note: absent without LaTeX in the source', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    const out = await renderCourseDiagrams(mermaidHtml, 'light', 'Formules hors des nœuds.');

    expect(out).not.toContain('course-mermaid__note');
  });

  it('note: absent when no note is provided, even with LaTeX', async () => {
    const src = renderCourseMarkdown('```mermaid\nflowchart LR\n  A["$y=x$"]\n```');
    mermaidRender.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    const out = await renderCourseDiagrams(src, 'light');

    expect(out).not.toContain('course-mermaid__note');
  });

  it('note: never set on a failed diagram', async () => {
    const src = renderCourseMarkdown('```mermaid\nflowchart LR\n  A["$y=x$"]\n```');
    mermaidRender.mockRejectedValue(new Error('parse error'));

    const out = await renderCourseDiagrams(src, 'light', 'Formules hors des nœuds.');

    expect(out).toContain('course-mermaid--error');
    expect(out).not.toContain('course-mermaid__note');
  });
});

describe('embedded resources (oc-resource)', () => {
  it('an oc-resource image becomes a data-oc-resource-id placeholder without src', () => {
    const div = render('![Photo de classe](oc-resource:abc-123)');
    const img = div.querySelector('img');
    expect(img?.getAttribute('data-oc-resource-id')).toBe('abc-123');
    expect(img?.hasAttribute('src')).toBe(false);
    expect(img?.getAttribute('alt')).toBe('Photo de classe');
    expect(img?.classList.contains('course-resource--pending')).toBe(true);
  });

  it('an oc-resource link becomes an <a> without href, inner text preserved', () => {
    const div = render('[le **doc**](oc-resource:def-456)');
    const a = div.querySelector('a');
    expect(a?.getAttribute('data-oc-resource-id')).toBe('def-456');
    expect(a?.hasAttribute('href')).toBe(false);
    expect(a?.querySelector('strong')?.textContent).toBe('doc');
  });

  it('an external image/link keeps the default markdown rendering', () => {
    const div = render('![y](https://img.test/a.png) et [ext](https://x.test)');
    expect(div.querySelector('img')?.getAttribute('src')).toBe('https://img.test/a.png');
    expect(div.querySelector('img')?.hasAttribute('data-oc-resource-id')).toBe(false);
    expect(div.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
  });

  it('oc-resource inside a code block is not transformed', () => {
    const div = render('```\n![x](oc-resource:zzz)\n```');
    expect(div.querySelector('[data-oc-resource-id]')).toBeNull();
    expect(div.textContent).toContain('oc-resource:zzz');
  });
});

describe('embedded modules (oc-module)', () => {
  // Les ids de module sont des UUID (forme validée par parseModuleRef —
  // garde contre les requêtes API forgées depuis le markdown).
  const MOD_ID = '5f0f9c3a-1234-4abc-8def-0123456789ab';
  const MOD_ID_2 = '6a1e8d4b-5678-4cde-9f01-23456789abcd';

  it('an oc-module link becomes a data-oc-module-id placeholder span (text as fallback)', () => {
    const div = render(`[Quiz interactif](oc-module:${MOD_ID})`);
    const span = div.querySelector('span.course-module-embed');
    expect(span?.getAttribute('data-oc-module-id')).toBe(MOD_ID);
    expect(span?.classList.contains('course-module-embed--pending')).toBe(true);
    expect(span?.textContent).toBe('Quiz interactif');
    // Jamais un <a> : le placeholder est monté en composant par markdown-view.
    expect(div.querySelector('a')).toBeNull();
  });

  it('the image syntax ![…](oc-module:…) renders the same placeholder (no emptied <img>)', () => {
    const div = render(`![Quiz interactif](oc-module:${MOD_ID})`);
    const span = div.querySelector('span.course-module-embed');
    expect(span?.getAttribute('data-oc-module-id')).toBe(MOD_ID);
    expect(span?.textContent).toBe('Quiz interactif');
    expect(div.querySelector('img')).toBeNull();
  });

  it('an id without the UUID shape is rejected (default marked link)', () => {
    // Path traversal ou id fantaisiste : jamais de placeholder → jamais
    // interpolé dans l’URL du GET /modules/{id}.
    for (const md of ['[x](oc-module:../../autre)', '[x](oc-module:mod-123)']) {
      expect(render(md).querySelector('[data-oc-module-id]')).toBeNull();
    }
  });

  it('oc-module is recognized before oc-resource (disjoint schemes)', () => {
    const div = render(`[m](oc-module:${MOD_ID}) et [r](oc-resource:r-1)`);
    expect(div.querySelector('[data-oc-module-id]')).not.toBeNull();
    expect(div.querySelector('[data-oc-resource-id]')).not.toBeNull();
  });

  it('oc-module inside a code block is not transformed', () => {
    const div = render(`\`\`\`\n[x](oc-module:${MOD_ID_2})\n\`\`\``);
    expect(div.querySelector('[data-oc-module-id]')).toBeNull();
    expect(div.textContent).toContain(`oc-module:${MOD_ID_2}`);
  });

  it('hasCourseModules detects the presence of a placeholder', () => {
    expect(hasCourseModules(renderCourseMarkdown(`[m](oc-module:${MOD_ID})`))).toBe(true);
    expect(hasCourseModules(renderCourseMarkdown('du texte'))).toBe(false);
  });
});

describe('resolveCourseResources', () => {
  const MISSING = 'Ressource indisponible';

  /** Résout puis rend dans un div jsdom pour interroger le DOM produit. */
  async function resolveInto(
    markdown: string,
    resolve: Parameters<typeof resolveCourseResources>[1],
  ): Promise<HTMLDivElement> {
    const div = document.createElement('div');
    div.innerHTML = await resolveCourseResources(renderCourseMarkdown(markdown), resolve, MISSING);
    return div;
  }

  it('detects the presence of references', () => {
    expect(hasCourseResources(renderCourseMarkdown('![a](oc-resource:x)'))).toBe(true);
    expect(hasCourseResources(renderCourseMarkdown('## Titre'))).toBe(false);
  });

  it('resolves an image into a presigned <img> (id kept for the PDF export)', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ url: 'https://s3.test/img.png', kind: 'image', label: 'Photo' });
    const div = await resolveInto('![Photo](oc-resource:img-1)', resolve);
    const img = div.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://s3.test/img.png');
    expect(img?.getAttribute('alt')).toBe('Photo');
    // Le placeholder « pending » est remplacé, mais l'id reste posé (data-*)
    // pour reconstruire une URL stable à l'export PDF.
    expect(img?.classList.contains('course-resource--pending')).toBe(false);
    expect(img?.getAttribute('data-oc-resource-id')).toBe('img-1');
    expect(resolve).toHaveBeenCalledWith('img-1');
  });

  it('resolves audio and video into embedded players (element chosen by type)', async () => {
    const audio = (
      await resolveInto('[son](oc-resource:a-1)', () =>
        Promise.resolve({ url: 'https://s3.test/a.mp3', kind: 'audio', label: 'son' }),
      )
    ).querySelector('audio');
    expect(audio?.getAttribute('src')).toBe('https://s3.test/a.mp3');
    expect(audio?.hasAttribute('controls')).toBe(true);

    const video = (
      await resolveInto('[clip](oc-resource:v-1)', () =>
        Promise.resolve({ url: 'https://s3.test/v.mp4', kind: 'video', label: 'clip' }),
      )
    ).querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://s3.test/v.mp4');
    expect(video?.hasAttribute('controls')).toBe(true);
  });

  it('resolves a document into a downloadable link (new tab)', async () => {
    const a = (
      await resolveInto('[Énoncé.pdf](oc-resource:d-1)', () =>
        Promise.resolve({ url: 'https://s3.test/e.pdf', kind: 'link', label: 'Énoncé.pdf' }),
      )
    ).querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://s3.test/e.pdf');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
    expect(a?.textContent).toBe('Énoncé.pdf');
  });

  it('unavailable resource (null): unavailable note', async () => {
    const div = await resolveInto('![x](oc-resource:gone)', () => Promise.resolve(null));
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelector('.course-resource--missing')?.textContent).toBe(MISSING);
  });

  it('resolve failure (rejection): treated as unavailable', async () => {
    const div = await resolveInto('![x](oc-resource:boom)', () =>
      Promise.reject(new Error('nope')),
    );
    expect(div.querySelector('.course-resource--missing')).toBeTruthy();
  });

  it('an id referenced several times is presigned only once', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ url: 'https://s3.test/x.png', kind: 'image', label: 'x' });
    const div = await resolveInto('![a](oc-resource:dup)\n\n![b](oc-resource:dup)', resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(div.querySelectorAll('img')).toHaveLength(2);
  });

  it('without any reference: HTML unchanged, resolve never called', async () => {
    const html = renderCourseMarkdown('Juste du **texte**.');
    const resolve = vi.fn();
    const out = await resolveCourseResources(html, resolve, MISSING);
    expect(out).toBe(html);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('mermaidSourceHasMath', () => {
  it('detects $…$ and $$…$$', () => {
    expect(mermaidSourceHasMath('flowchart LR\n  A["Courbe $y=x$"]')).toBe(true);
    expect(mermaidSourceHasMath('P((" $$(\\ell,\\ell)$$ "))')).toBe(true);
  });

  it('false on a source without math delimiters', () => {
    expect(mermaidSourceHasMath('graph TD; A-->B')).toBe(false);
    expect(mermaidSourceHasMath('flowchart LR\n  A["Un prix de 20"]')).toBe(false);
  });
});
