import en from '../../i18n/en';
import fr from '../../i18n/fr';
import {
  CALLOUT_FALLBACK_TITLES,
  CALLOUT_KINDS,
  calloutKind,
  resolveCalloutTitles,
} from './course-callouts';
import { renderCourseMarkdown } from './course-markdown';

/** Rend dans un div jsdom pour interroger le DOM produit. */
function render(
  markdown: string,
  titles?: Parameters<typeof resolveCalloutTitles>[0],
): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = renderCourseMarkdown(
    markdown,
    titles === undefined ? {} : { calloutTitles: resolveCalloutTitles(titles) },
  );
  return div;
}

const title = (el: HTMLElement) => el.querySelector('.course-callout__title');

describe('calloutKind', () => {
  it('reads the six keywords, whatever the case, accents and spaces', () => {
    expect(calloutKind('DEFINITION')).toBe('definition');
    expect(calloutKind('Définition')).toBe('definition');
    expect(calloutKind('retenir')).toBe('keypoint');
    expect(calloutKind('À retenir')).toBe('keypoint');
    expect(calloutKind(' a  RETENIR ')).toBe('keypoint');
    expect(calloutKind('MÉTHODE')).toBe('method');
    expect(calloutKind('exemple')).toBe('example');
    expect(calloutKind('Remarque')).toBe('note');
    expect(calloutKind('attention')).toBe('warning');
  });

  it('accepts the GitHub alert keywords and the English spellings as aliases', () => {
    expect(calloutKind('NOTE')).toBe('note');
    expect(calloutKind('TIP')).toBe('method');
    expect(calloutKind('IMPORTANT')).toBe('keypoint');
    expect(calloutKind('WARNING')).toBe('warning');
    expect(calloutKind('caution')).toBe('warning');
    expect(calloutKind('Example')).toBe('example');
    expect(calloutKind('METHOD')).toBe('method');
  });

  it('rejects anything else', () => {
    for (const keyword of ['', 'ASTUCE', 'DEF', 'constructor', 'NOTE!', 'A-RETENIR']) {
      expect(calloutKind(keyword)).toBeNull();
    }
  });
});

describe('resolveCalloutTitles', () => {
  it('takes each title from the translation, falling back when missing or blank', () => {
    const titles = resolveCalloutTitles({ definition: 'Definition', keypoint: ' ', method: 3 });
    expect(titles.definition).toBe('Definition');
    expect(titles.keypoint).toBe(CALLOUT_FALLBACK_TITLES.keypoint);
    expect(titles.method).toBe(CALLOUT_FALLBACK_TITLES.method);
  });

  it('fallback titles mirror the French translation; every kind is translated', () => {
    expect(fr.markdownView.callouts).toEqual(CALLOUT_FALLBACK_TITLES);
    expect(Object.keys(en.markdownView.callouts).sort()).toEqual([...CALLOUT_KINDS].sort());
  });
});

describe('renderCourseMarkdown — callouts', () => {
  it('turns a quote opened by a marker into a callout titled after its kind', () => {
    const el = render('> [!DEFINITION]\n> Une fonction affine est de la forme $f(x) = ax + b$.');
    const callout = el.querySelector('div.course-callout.course-callout--definition');
    expect(callout).not.toBeNull();
    expect(el.querySelector('blockquote')).toBeNull();
    expect(title(el)?.textContent).toBe('Définition');
    const body = callout?.querySelectorAll(':scope > p');
    expect(body).toHaveLength(2);
    expect(body?.[1].textContent).toContain('Une fonction affine');
    expect(body?.[1].querySelector('.katex')).not.toBeNull();
  });

  it('uses the titles given by the caller (interface language)', () => {
    const el = render('> [!RETENIR]\n> x', en.markdownView.callouts);
    expect(title(el)?.textContent).toBe('Key point');
  });

  it('text after the marker replaces the title, the kind staying readable to screen readers', () => {
    const el = render(
      '> [!RETENIR] Théorème de **Pythagore** $a^2 + b^2 = c^2$\n> Dans un triangle rectangle…',
    );
    const heading = title(el);
    expect(heading?.querySelector('.sr-only')?.textContent).toBe('À retenir : ');
    expect(heading?.querySelector('strong')?.textContent).toBe('Pythagore');
    expect(heading?.querySelector('.katex')).not.toBeNull();
    expect(heading?.textContent).not.toContain('[!');
    expect(el.querySelector('.course-callout > p:last-child')?.textContent).toBe(
      'Dans un triangle rectangle…',
    );
  });

  it('keywords follow calloutKind: accents, case and GitHub aliases', () => {
    expect(render('> [!Méthode]\n> x').querySelector('.course-callout--method')).not.toBeNull();
    expect(render('> [!à retenir]\n> x').querySelector('.course-callout--keypoint')).not.toBeNull();
    const note = render('> [!NOTE]\n> x');
    expect(note.querySelector('.course-callout--note')).not.toBeNull();
    expect(title(note)?.textContent).toBe('Remarque');
    expect(render('> [!warning]\n> x').querySelector('.course-callout--warning')).not.toBeNull();
  });

  it('the body is full markdown: paragraphs, lists, centered formulas, fences', () => {
    const el = render(
      [
        '> [!METHODE] Résoudre $ax + b = 0$',
        '> 1. Isoler le terme en $x$.',
        '> 2. Diviser par $a$ :',
        '>',
        '> $$x = -\\frac{b}{a}$$',
        '>',
        '> ```passage',
        '> Une ligne',
        '> ```',
      ].join('\n'),
    );
    const callout = el.querySelector('.course-callout--method');
    expect(callout?.querySelectorAll('ol > li')).toHaveLength(2);
    expect(callout?.querySelector('.katex-display')).not.toBeNull();
    expect(callout?.querySelector('pre > code.language-passage')?.textContent).toBe('Une ligne\n');
  });

  it('a marker alone on its line, a blank quote line, then the body', () => {
    const el = render('> [!EXEMPLE]\n>\n> Premier paragraphe.\n>\n> Second.');
    const children = [...(el.querySelector('.course-callout')?.children ?? [])];
    expect(children.map((child) => child.textContent)).toEqual([
      'Exemple',
      'Premier paragraphe.',
      'Second.',
    ]);
  });

  it('a title without body, and a hard break right after the marker', () => {
    const alone = render('> [!ATTENTION] Ne pas confondre aire et périmètre');
    expect(alone.querySelector('.course-callout')?.children).toHaveLength(1);
    expect(title(alone)?.textContent).toBe('Attention : Ne pas confondre aire et périmètre');

    const broken = render('> [!TIP]  \n> La suite.');
    expect(title(broken)?.textContent).toBe('Méthode');
    expect(broken.querySelector('.course-callout > p:last-child')?.textContent).toBe('La suite.');
  });

  it('a line glued to the callout joins it (lazy continuation): a blank line ends it', () => {
    const glued = render('> [!NOTE]\n> Dedans.\nToujours dedans.');
    expect(glued.querySelector('.course-callout')?.textContent).toContain('Toujours dedans.');
    const ended = render('> [!NOTE]\n> Dedans.\n\nDehors.');
    expect(ended.querySelector('.course-callout')?.textContent).not.toContain('Dehors.');
  });

  it('callouts nest, in a callout or in a list', () => {
    const nested = render('> [!DEFINITION]\n> Le carré.\n>\n> > [!EXEMPLE]\n> > $3^2 = 9$');
    expect(
      nested.querySelector('.course-callout--definition .course-callout--example'),
    ).not.toBeNull();
    const listed = render('- Point\n\n  > [!REMARQUE]\n  > Dans la liste.');
    expect(listed.querySelector('li .course-callout--note')).not.toBeNull();
  });

  it('anything else stays an ordinary quote, marker visible', () => {
    for (const markdown of [
      '> [!ASTUCE]\n> Type inconnu.',
      '> Voici [!NOTE] au milieu.',
      '> \\[!NOTE]\n> Marqueur échappé.',
      '> **[!NOTE]**\n> Marqueur en gras.',
      '> # [!NOTE]',
    ]) {
      const el = render(markdown);
      expect(el.querySelector('.course-callout')).toBeNull();
      expect(el.querySelector('blockquote')?.textContent).toContain('[!');
    }
  });

  it('the custom title is sanitized with the rest of the block', () => {
    const el = render('> [!NOTE] <img src="x" onerror="alert(1)"> Titre\n> Corps');
    expect(el.innerHTML).not.toContain('onerror');
    expect(title(el)?.textContent).toContain('Titre');
  });

  it('titles never leak from one render to the next', () => {
    render('> [!DEFINITION]\n> x', en.markdownView.callouts);
    expect(title(render('> [!DEFINITION]\n> x'))?.textContent).toBe('Définition');
  });
});
