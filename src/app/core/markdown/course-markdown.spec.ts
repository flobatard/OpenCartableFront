import { renderCourseMarkdown } from './course-markdown';

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
});
