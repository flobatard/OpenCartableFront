import type { Mock } from 'vitest';
import mermaid from 'mermaid';
import {
  hasCourseDiagrams,
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

  it('diagramme invalide : le libellé et le message d’erreur mermaid sont affichés', async () => {
    mermaidRender.mockRejectedValue(new Error('Parse error on line 2'));

    const out = await renderCourseDiagrams(mermaidHtml, 'light', undefined, 'Diagramme invalide :');

    expect(out).toContain('course-mermaid__error');
    expect(out).toContain('Diagramme invalide :');
    expect(out).toContain('Parse error on line 2');
  });

  it('diagramme invalide sans libellé fourni : pas de légende d’erreur', async () => {
    mermaidRender.mockRejectedValue(new Error('parse error'));

    const out = await renderCourseDiagrams(mermaidHtml, 'light');

    expect(out).not.toContain('course-mermaid__error');
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

describe('ressources intégrées (oc-resource)', () => {
  it('une image oc-resource devient un placeholder data-oc-resource-id sans src', () => {
    const div = render('![Photo de classe](oc-resource:abc-123)');
    const img = div.querySelector('img');
    expect(img?.getAttribute('data-oc-resource-id')).toBe('abc-123');
    expect(img?.hasAttribute('src')).toBe(false);
    expect(img?.getAttribute('alt')).toBe('Photo de classe');
    expect(img?.classList.contains('course-resource--pending')).toBe(true);
  });

  it('un lien oc-resource devient un <a> sans href, texte interne préservé', () => {
    const div = render('[le **doc**](oc-resource:def-456)');
    const a = div.querySelector('a');
    expect(a?.getAttribute('data-oc-resource-id')).toBe('def-456');
    expect(a?.hasAttribute('href')).toBe(false);
    expect(a?.querySelector('strong')?.textContent).toBe('doc');
  });

  it('une image/lien externe garde le rendu markdown par défaut', () => {
    const div = render('![y](https://img.test/a.png) et [ext](https://x.test)');
    expect(div.querySelector('img')?.getAttribute('src')).toBe('https://img.test/a.png');
    expect(div.querySelector('img')?.hasAttribute('data-oc-resource-id')).toBe(false);
    expect(div.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
  });

  it('oc-resource dans un bloc de code n’est pas transformé', () => {
    const div = render('```\n![x](oc-resource:zzz)\n```');
    expect(div.querySelector('[data-oc-resource-id]')).toBeNull();
    expect(div.textContent).toContain('oc-resource:zzz');
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

  it('détecte la présence de références', () => {
    expect(hasCourseResources(renderCourseMarkdown('![a](oc-resource:x)'))).toBe(true);
    expect(hasCourseResources(renderCourseMarkdown('## Titre'))).toBe(false);
  });

  it('résout une image en <img> présigné (placeholder retiré)', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ url: 'https://s3.test/img.png', kind: 'image', label: 'Photo' });
    const div = await resolveInto('![Photo](oc-resource:img-1)', resolve);
    const img = div.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://s3.test/img.png');
    expect(img?.getAttribute('alt')).toBe('Photo');
    expect(img?.hasAttribute('data-oc-resource-id')).toBe(false);
    expect(resolve).toHaveBeenCalledWith('img-1');
  });

  it('résout audio et vidéo en lecteurs intégrés (élément choisi par le type)', async () => {
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

  it('résout un document en lien téléchargeable (nouvel onglet)', async () => {
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

  it('ressource indisponible (null) : note « indisponible »', async () => {
    const div = await resolveInto('![x](oc-resource:gone)', () => Promise.resolve(null));
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelector('.course-resource--missing')?.textContent).toBe(MISSING);
  });

  it('échec du resolve (rejet) : traité comme indisponible', async () => {
    const div = await resolveInto('![x](oc-resource:boom)', () =>
      Promise.reject(new Error('nope')),
    );
    expect(div.querySelector('.course-resource--missing')).toBeTruthy();
  });

  it('un id référencé plusieurs fois n’est présigné qu’une seule fois', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ url: 'https://s3.test/x.png', kind: 'image', label: 'x' });
    const div = await resolveInto('![a](oc-resource:dup)\n\n![b](oc-resource:dup)', resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(div.querySelectorAll('img')).toHaveLength(2);
  });

  it('sans référence : HTML inchangé, resolve jamais appelé', async () => {
    const html = renderCourseMarkdown('Juste du **texte**.');
    const resolve = vi.fn();
    const out = await resolveCourseResources(html, resolve, MISSING);
    expect(out).toBe(html);
    expect(resolve).not.toHaveBeenCalled();
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
