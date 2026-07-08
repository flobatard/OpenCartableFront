import type { Mock } from 'vitest';
import mermaid from 'mermaid';
import {
  hasCourseDiagrams,
  mermaidSourceHasMath,
  renderCourseDiagrams,
  renderCourseMarkdown,
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
  it('rend le markdown pur comme avant (GFM)', () => {
    const div = render('## Section\n\nUn **paragraphe**.');
    expect(div.querySelector('h2')?.textContent).toBe('Section');
    expect(div.querySelector('strong')?.textContent).toBe('paragraphe');
    expect(div.querySelector('.katex')).toBeNull();
  });

  it('rend une formule en ligne $…$ sans mode display', () => {
    const div = render('Soit $x^2$ un carré.');
    expect(div.querySelectorAll('.katex')).toHaveLength(1);
    expect(div.querySelector('.katex-display')).toBeNull();
  });

  it('rend $$…$$ en formule centrée (display)', () => {
    expect(render('$$\\int_0^1 x\\,dx$$').querySelector('.katex-display')).toBeTruthy();
    expect(render('$$\n\\frac{a}{b}\n$$').querySelector('.katex-display')).toBeTruthy();
  });

  it('un $$…$$ au fil du paragraphe est centré sans casser le paragraphe', () => {
    const div = render('Avant $$y^2$$ après.');
    expect(div.querySelector('.katex-display')).toBeTruthy();
    expect(div.textContent).toContain('Avant');
    expect(div.textContent).toContain('après.');
  });

  it('les styles inline et le MathML de KaTeX survivent à la sanitisation', () => {
    const html = renderCourseMarkdown('$x^2$');
    expect(html).toContain('style=');
    expect(html).toContain('<math');
    expect(html).toContain('<annotation');
  });

  it('purge les scripts et les handlers d’événements', () => {
    const html = renderCourseMarkdown('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('\\$ échappé reste un dollar littéral', () => {
    const div = render('Ça coûte \\$5 et \\$10.');
    expect(div.querySelector('.katex')).toBeNull();
    expect(div.textContent).toContain('$5 et $10');
  });

  it('un $ isolé ou des délimiteurs vides restent du texte', () => {
    expect(render('Un $ tout seul.').querySelector('.katex')).toBeNull();
    expect(render('$$$$').querySelector('.katex')).toBeNull();
    expect(render('$$ $$').querySelector('.katex')).toBeNull();
  });

  it('« 10$ et 20$ » (monnaie) n’est pas interprété comme une formule', () => {
    expect(render('10$ et 20$').querySelector('.katex')).toBeNull();
    expect(render('prix $20 et $30').querySelector('.katex')).toBeNull();
  });

  it('LaTeX invalide : pas d’exception, erreur rendue inline', () => {
    const div = render('$\\frac{$');
    expect(div.querySelector('.katex-error')).toBeTruthy();
  });

  it('les formules dans du code ne sont pas rendues', () => {
    expect(render('`code $y$`').querySelector('.katex')).toBeNull();
    expect(render('```\n$x^2$\n```').querySelector('.katex')).toBeNull();
  });

  it('mixe formules en ligne et bloc dans un même document', () => {
    const div = render('Soit $x$ :\n\n$$\ny = x\n$$');
    expect(div.querySelectorAll('.katex')).toHaveLength(2);
    expect(div.querySelectorAll('.katex-display')).toHaveLength(1);
  });

  it('un bloc ```mermaid reste un bloc de code source (repli synchrone)', () => {
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

  it('détecte la présence de blocs mermaid', () => {
    expect(hasCourseDiagrams(mermaidHtml)).toBe(true);
    expect(hasCourseDiagrams(renderCourseMarkdown('## Titre'))).toBe(false);
  });

  it('remplace le bloc source par le SVG rendu et sanitisé', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>A</text><script>alert(1)</script></svg>',
    });

    const out = await renderCourseDiagrams(mermaidHtml, 'light');

    expect(out).toContain('class="course-mermaid"');
    expect(out).toContain('<text>A</text>');
    expect(out).not.toContain('language-mermaid'); // source remplacée
    expect(out).not.toContain('<script'); // SVG repassé par DOMPurify
  });

  it('aligne le thème mermaid et force les libellés SVG (jamais foreignObject)', async () => {
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

  it('diagramme invalide : la source est conservée dans un bloc d’erreur', async () => {
    mermaidRender.mockRejectedValue(new Error('parse error'));

    const out = await renderCourseDiagrams(mermaidHtml, 'light');

    expect(out).toContain('course-mermaid--error');
    expect(out).toContain('graph TD');
  });

  it('sans bloc mermaid : HTML inchangé, mermaid jamais chargé', async () => {
    const html = renderCourseMarkdown('Juste du **texte**.');

    const out = await renderCourseDiagrams(html, 'light');

    expect(out).toBe(html);
    expect(mermaidRender).not.toHaveBeenCalled();
  });

  it('note : ajoutée quand la source a du LaTeX ET qu’une note est fournie', async () => {
    const src = renderCourseMarkdown('```mermaid\nflowchart LR\n  A["Courbe $y=x$"]\n```');
    mermaidRender.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    const out = await renderCourseDiagrams(src, 'light', 'Formules hors des nœuds.');

    expect(out).toContain('course-mermaid__note');
    expect(out).toContain('Formules hors des nœuds.');
  });

  it('note : absente sans LaTeX dans la source', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    const out = await renderCourseDiagrams(mermaidHtml, 'light', 'Formules hors des nœuds.');

    expect(out).not.toContain('course-mermaid__note');
  });

  it('note : absente si aucune note n’est fournie, même avec du LaTeX', async () => {
    const src = renderCourseMarkdown('```mermaid\nflowchart LR\n  A["$y=x$"]\n```');
    mermaidRender.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    const out = await renderCourseDiagrams(src, 'light');

    expect(out).not.toContain('course-mermaid__note');
  });

  it('note : jamais posée sur un diagramme en erreur', async () => {
    const src = renderCourseMarkdown('```mermaid\nflowchart LR\n  A["$y=x$"]\n```');
    mermaidRender.mockRejectedValue(new Error('parse error'));

    const out = await renderCourseDiagrams(src, 'light', 'Formules hors des nœuds.');

    expect(out).toContain('course-mermaid--error');
    expect(out).not.toContain('course-mermaid__note');
  });
});

describe('mermaidSourceHasMath', () => {
  it('détecte $…$ et $$…$$', () => {
    expect(mermaidSourceHasMath('flowchart LR\n  A["Courbe $y=x$"]')).toBe(true);
    expect(mermaidSourceHasMath('P((" $$(\\ell,\\ell)$$ "))')).toBe(true);
  });

  it('faux sur une source sans délimiteur math', () => {
    expect(mermaidSourceHasMath('graph TD; A-->B')).toBe(false);
    expect(mermaidSourceHasMath('flowchart LR\n  A["Un prix de 20"]')).toBe(false);
  });
});
