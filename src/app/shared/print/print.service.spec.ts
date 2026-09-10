import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PRINT_ID_SUFFIX,
  PRINT_ROOT_ID,
  PrintLabels,
  PrintService,
  keepHeadingsWithContent,
  transformForPrint,
  uniquifySvgIds,
} from './print.service';
import { courseContentUrl, resourceContentUrl } from '../../core/resources/resource.utils';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

/** Fragment DOM détaché à partir d'un HTML (jsdom). */
function fragment(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

/** Libellés de test — seule la note média varie selon les cas. */
function labels(mediaNote = ''): PrintLabels {
  return {
    mediaNote,
    interactiveFallback: 'Contenu interactif : voir la version en ligne.',
    moduleFallback: 'Module interactif : à retrouver dans le cours en ligne.',
  };
}

describe('transformForPrint', () => {
  it('replaces an audio with a note pointing to the stable URL', () => {
    const root = fragment(
      '<audio data-oc-resource-id="r1" aria-label="Podcast" src="https://s3/presigned" controls></audio>',
    );
    transformForPrint(root, 'course-1', 'fr', labels('Média en ligne :'));

    expect(root.querySelector('audio')).toBeNull();
    const note = root.querySelector('p.oc-print__media-note');
    expect(note?.textContent).toContain('Podcast');
    expect(note?.querySelector('a')?.getAttribute('href')).toBe(
      resourceContentUrl('fr', 'course-1', 'r1'),
    );
  });

  it('removes videos too', () => {
    const root = fragment('<video data-oc-resource-id="r5" aria-label="Clip" controls></video>');
    transformForPrint(root, 'course-1', 'fr', labels('Média :'));
    expect(root.querySelector('video')).toBeNull();
    expect(root.querySelector('p.oc-print__media-note')).toBeTruthy();
  });

  it('rewrites a resource link href to the stable URL', () => {
    const root = fragment('<a data-oc-resource-id="r2" href="https://s3/presigned">Doc</a>');
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      resourceContentUrl('fr', 'course-1', 'r2'),
    );
  });

  it('document card: clickable underlined name + copyable plain URL', () => {
    const root = fragment(
      '<div class="course-preview-document__card">' +
        '<span class="course-preview-document__name">Resume.pdf</span>' +
        '<span class="course-preview-document__meta">72 ko</span>' +
        '<button class="btn" data-oc-resource-id="r3">Télécharger</button>' +
        '</div>',
    );
    transformForPrint(root, 'course-1', 'fr', labels());
    const url = resourceContentUrl('fr', 'course-1', 'r3');

    expect(root.querySelector('button')).toBeNull();
    // Le nom devient un lien vers l'URL stable.
    const nameLink = root.querySelector('.course-preview-document__name a.oc-print__doc-name');
    expect(nameLink?.textContent).toBe('Resume.pdf');
    expect(nameLink?.getAttribute('href')).toBe(url);
    // Et l'URL est affichée en clair (copier-coller).
    expect(root.querySelector('.oc-print__doc-url')?.textContent).toBe(url);
  });

  it('document button without a name: falls back to a copyable link carrying the URL', () => {
    const root = fragment('<button data-oc-resource-id="r3">Télécharger</button>');
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('a.oc-print__doc-url')?.getAttribute('href')).toBe(
      resourceContentUrl('fr', 'course-1', 'r3'),
    );
  });

  it('keeps images (presigned URL still valid at print time)', () => {
    const root = fragment('<img data-oc-resource-id="r4" src="https://s3/presigned" alt="x">');
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://s3/presigned');
  });

  it('replaces the iframe of an embedded PDF with a note pointing to the stable URL', () => {
    const root = fragment(
      '<iframe class="course-preview-document__pdf" data-oc-resource-id="r6" title="Notes.pdf" src="https://s3/presigned"></iframe>',
    );
    transformForPrint(root, 'course-1', 'fr', labels('Média en ligne :'));

    expect(root.querySelector('iframe')).toBeNull();
    const note = root.querySelector('p.oc-print__media-note');
    expect(note?.textContent).toContain('Notes.pdf');
    expect(note?.querySelector('a')?.getAttribute('href')).toBe(
      resourceContentUrl('fr', 'course-1', 'r6'),
    );
  });

  it('PDF iframe without a course (null courseId): note without a link', () => {
    const root = fragment('<iframe data-oc-resource-id="r6" title="Notes.pdf"></iframe>');
    transformForPrint(root, null, 'fr', labels('Média en ligne :'));
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.querySelector('p.oc-print__media-note')).toBeTruthy();
    expect(root.querySelector('p.oc-print__media-note a')).toBeNull();
  });

  it('replaces a non-printable extension with the interactive-content note', () => {
    const root = fragment(
      '<div class="course-extension" data-oc-extension="geogebra" data-oc-printable="false">' +
        '<iframe src="https://www.geogebra.org/material/iframe/id/abc"></iframe>' +
        '</div>',
    );
    transformForPrint(root, 'course-1', 'fr', labels());

    expect(root.querySelector('[data-oc-extension]')).toBeNull();
    expect(root.querySelector('iframe')).toBeNull();
    const note = root.querySelector('p.oc-print__extension-note');
    expect(note?.textContent).toBe('Contenu interactif : voir la version en ligne.');
  });

  it('also substitutes a not-yet-mounted extension placeholder (visible source)', () => {
    const root = fragment(
      '<div class="course-extension" data-oc-extension="geogebra" data-oc-printable="false">id=abc</div>',
    );
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('p.oc-print__extension-note')).not.toBeNull();
  });

  it('replaces a module embed with the dedicated note + link to the course', () => {
    // Couvre les deux hôtes : span oc-module du markdown et hôte ModuleEmbed
    // d'un bloc module de l'aperçu — tous deux portent data-oc-module-id.
    const root = fragment(
      '<span class="course-module-embed" data-oc-module-id="m-1"><iframe sandbox="allow-scripts"></iframe></span>' +
        '<app-module-embed data-oc-module-id="m-2"></app-module-embed>',
    );
    transformForPrint(root, 'course-1', 'fr', labels());

    expect(root.querySelector('[data-oc-module-id]')).toBeNull();
    expect(root.querySelector('iframe')).toBeNull();
    const notes = root.querySelectorAll('p.oc-print__extension-note');
    expect(notes.length).toBe(2);
    // Note au motif extension (même classe) mais libellé module + URL stable
    // de la page du cours — le lecteur du PDF sait où retrouver l'interactif.
    expect(notes[0].textContent).toContain(
      'Module interactif : à retrouver dans le cours en ligne.',
    );
    expect(notes[0].querySelector('a')?.getAttribute('href')).toBe(
      courseContentUrl('fr', 'course-1'),
    );
  });

  it('module outside a course context: textual note without a link', () => {
    const root = fragment('<span data-oc-module-id="m-1"></span>');
    transformForPrint(root, null, 'fr', labels());
    const note = root.querySelector('p.oc-print__extension-note');
    expect(note?.textContent).toBe('Module interactif : à retrouver dans le cours en ligne.');
    expect(note?.querySelector('a')).toBeNull();
  });

  it('keeps a printable extension as-is (cloned SVG)', () => {
    const root = fragment(
      '<div class="course-extension" data-oc-extension="jsxgraph" data-oc-printable="true">' +
        '<svg><circle r="1"></circle></svg>' +
        '</div>',
    );
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('[data-oc-extension] svg')).not.toBeNull();
    expect(root.querySelector('.oc-print__extension-note')).toBeNull();
  });

  it('without courseId: media removed (note without link), links left untouched', () => {
    const root = fragment(
      '<audio data-oc-resource-id="r1" aria-label="Podcast" controls></audio>' +
        '<a data-oc-resource-id="r2" href="https://s3/presigned">Doc</a>',
    );
    transformForPrint(root, null, 'fr', labels('Média :'));

    expect(root.querySelector('audio')).toBeNull();
    expect(root.querySelector('p.oc-print__media-note')?.querySelector('a')).toBeNull();
    // Le seul <a> restant est le lien document, inchangé (pas d'URL stable possible).
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://s3/presigned');
  });
});

describe('keepHeadingsWithContent', () => {
  it('groups a heading with the blocks that follow it (keep-with-next)', () => {
    const root = fragment(
      '<div class="course-content">' +
        '<h3>Cas où |a| < 1</h3><p>On sait que</p><p>Formule</p>' +
        '<h3>Cas où |a| ≥ 1</h3><p>Suite</p>' +
        '</div>',
    );
    keepHeadingsWithContent(root);

    const sections = root.querySelectorAll('.oc-print__keep');
    expect(sections.length).toBe(2);
    // Premier groupe : le titre + ses deux paragraphes.
    expect(sections[0].querySelector('h3')?.textContent).toBe('Cas où |a| < 1');
    expect(sections[0].querySelectorAll('p').length).toBe(2);
  });

  it('bounds the grouping to the cap (3 following blocks)', () => {
    const root = fragment(
      '<div class="course-content"><h3>T</h3><p>1</p><p>2</p><p>3</p><p>4</p><p>5</p></div>',
    );
    keepHeadingsWithContent(root);
    const kept = root.querySelector('.oc-print__keep');
    // titre + 3 paragraphes gardés ; les 4e/5e restent hors du groupe.
    expect(kept?.querySelectorAll('p').length).toBe(3);
    expect(root.querySelectorAll('.course-content > p').length).toBe(2);
  });

  it('does not wrap a heading with no content after it', () => {
    const root = fragment('<div class="course-content"><h3>Seul</h3></div>');
    keepHeadingsWithContent(root);
    expect(root.querySelector('.oc-print__keep')).toBeNull();
  });
});

describe('uniquifySvgIds', () => {
  const svg = (inner: string, attrs = '') =>
    fragment(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`);

  it('renames ids and their url(#…) references (masks, gradients)', () => {
    const root = svg(
      '<defs><mask id="m1"></mask><linearGradient id="g1"></linearGradient></defs>' +
        '<line mask="url(#m1)" stroke="url(\'#g1\')" style="fill: url(#g1)"></line>' +
        '<rect fill="url(#ailleurs)"></rect>',
    );
    uniquifySvgIds(root);
    expect(root.querySelector('mask')?.id).toBe(`m1${PRINT_ID_SUFFIX}`);
    expect(root.querySelector('linearGradient')?.id).toBe(`g1${PRINT_ID_SUFFIX}`);
    const line = root.querySelector('line')!;
    expect(line.getAttribute('mask')).toBe(`url(#m1${PRINT_ID_SUFFIX})`);
    expect(line.getAttribute('stroke')).toBe(`url('#g1${PRINT_ID_SUFFIX}')`);
    expect(line.getAttribute('style')).toBe(`fill: url(#g1${PRINT_ID_SUFFIX})`);
    // Référence vers un id absent du SVG : laissée telle quelle.
    expect(root.querySelector('rect')?.getAttribute('fill')).toBe('url(#ailleurs)');
  });

  it('rewrites href references and aria id lists', () => {
    const root = svg(
      '<title id="t"></title><path id="p"></path><use href="#p"></use>',
      'aria-labelledby="t autre"',
    );
    uniquifySvgIds(root);
    expect(root.querySelector('use')?.getAttribute('href')).toBe(`#p${PRINT_ID_SUFFIX}`);
    expect(root.querySelector('svg')?.getAttribute('aria-labelledby')).toBe(
      `t${PRINT_ID_SUFFIX} autre`,
    );
  });

  it('rewrites the id-scoped rules of an embedded <style> (Mermaid)', () => {
    const root = svg('<style>#d1 .node { fill: #fff; } #d1 path { marker-end: url(#arrow); }</style>' +
      '<marker id="arrow"></marker>', 'id="d1"');
    uniquifySvgIds(root);
    expect(root.querySelector('svg')?.id).toBe(`d1${PRINT_ID_SUFFIX}`);
    expect(root.querySelector('style')?.textContent).toBe(
      `#d1${PRINT_ID_SUFFIX} .node { fill: #fff; } #d1${PRINT_ID_SUFFIX} path { marker-end: url(#arrow${PRINT_ID_SUFFIX}); }`,
    );
  });

  it('leaves an SVG without ids untouched', () => {
    const root = svg('<circle r="4" fill="url(#x)"></circle>');
    const before = root.innerHTML;
    uniquifySvgIds(root);
    expect(root.innerHTML).toBe(before);
  });

  it('runs as part of transformForPrint', () => {
    const root = svg('<mask id="m"></mask><line mask="url(#m)"></line>');
    transformForPrint(root, null, 'fr', labels());
    expect(root.querySelector('line')?.getAttribute('mask')).toBe(`url(#m${PRINT_ID_SUFFIX})`);
  });
});

describe('PrintService', () => {
  it('mounts the content, prints, then cleans up the container (browser)', async () => {
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    const service = TestBed.inject(PrintService);

    let rootDuringPrint: HTMLElement | null = null;
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
      rootDuringPrint = document.getElementById(PRINT_ROOT_ID);
    });

    const source = document.createElement('div');
    source.innerHTML = '<p>Contenu de cours</p>';
    await service.printCourseContent(source, 'course-1');

    expect(printSpy).toHaveBeenCalledOnce();
    // Le conteneur existait bien pendant l'impression…
    expect(rootDuringPrint).not.toBeNull();
    // …et a été retiré après.
    expect(document.getElementById(PRINT_ROOT_ID)).toBeNull();

    printSpy.mockRestore();
  });

  it('does nothing during SSR (no printing)', async () => {
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
    const service = TestBed.inject(PrintService);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    await service.printCourseContent(document.createElement('div'), 'course-1');

    expect(printSpy).not.toHaveBeenCalled();
    expect(document.getElementById(PRINT_ROOT_ID)).toBeNull();
    printSpy.mockRestore();
  });
});
