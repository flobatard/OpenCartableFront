import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PRINT_ROOT_ID,
  PrintLabels,
  PrintService,
  keepHeadingsWithContent,
  transformForPrint,
} from './print.service';
import { resourceContentUrl } from '../resources/resource.utils';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

/** Fragment DOM détaché à partir d'un HTML (jsdom). */
function fragment(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

/** Libellés de test — seule la note média varie selon les cas. */
function labels(mediaNote = ''): PrintLabels {
  return { mediaNote, interactiveFallback: 'Contenu interactif : voir la version en ligne.' };
}

describe('transformForPrint', () => {
  it('remplace un audio par une note renvoyant vers l’URL stable', () => {
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

  it('retire aussi les vidéos', () => {
    const root = fragment('<video data-oc-resource-id="r5" aria-label="Clip" controls></video>');
    transformForPrint(root, 'course-1', 'fr', labels('Média :'));
    expect(root.querySelector('video')).toBeNull();
    expect(root.querySelector('p.oc-print__media-note')).toBeTruthy();
  });

  it('réécrit le href d’un lien ressource vers l’URL stable', () => {
    const root = fragment('<a data-oc-resource-id="r2" href="https://s3/presigned">Doc</a>');
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      resourceContentUrl('fr', 'course-1', 'r2'),
    );
  });

  it('carte document : nom cliquable souligné + URL en clair copiable', () => {
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

  it('bouton document sans nom : repli sur un lien copiable portant l’URL', () => {
    const root = fragment('<button data-oc-resource-id="r3">Télécharger</button>');
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('a.oc-print__doc-url')?.getAttribute('href')).toBe(
      resourceContentUrl('fr', 'course-1', 'r3'),
    );
  });

  it('conserve les images (URL présignée valide au moment de l’impression)', () => {
    const root = fragment('<img data-oc-resource-id="r4" src="https://s3/presigned" alt="x">');
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://s3/presigned');
  });

  it('remplace une extension non imprimable par la note « contenu interactif »', () => {
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

  it('substitue aussi un placeholder d’extension non encore monté (source visible)', () => {
    const root = fragment(
      '<div class="course-extension" data-oc-extension="geogebra" data-oc-printable="false">id=abc</div>',
    );
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('p.oc-print__extension-note')).not.toBeNull();
  });

  it('conserve telle quelle une extension imprimable (SVG cloné)', () => {
    const root = fragment(
      '<div class="course-extension" data-oc-extension="jsxgraph" data-oc-printable="true">' +
        '<svg><circle r="1"></circle></svg>' +
        '</div>',
    );
    transformForPrint(root, 'course-1', 'fr', labels());
    expect(root.querySelector('[data-oc-extension] svg')).not.toBeNull();
    expect(root.querySelector('.oc-print__extension-note')).toBeNull();
  });

  it('sans courseId : média retiré (note sans lien), liens laissés tels quels', () => {
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
  it('regroupe un titre avec les blocs qui le suivent (keep-with-next)', () => {
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

  it('borne le regroupement au cap (3 blocs suivants)', () => {
    const root = fragment(
      '<div class="course-content"><h3>T</h3><p>1</p><p>2</p><p>3</p><p>4</p><p>5</p></div>',
    );
    keepHeadingsWithContent(root);
    const kept = root.querySelector('.oc-print__keep');
    // titre + 3 paragraphes gardés ; les 4e/5e restent hors du groupe.
    expect(kept?.querySelectorAll('p').length).toBe(3);
    expect(root.querySelectorAll('.course-content > p').length).toBe(2);
  });

  it('n’enveloppe pas un titre sans contenu à sa suite', () => {
    const root = fragment('<div class="course-content"><h3>Seul</h3></div>');
    keepHeadingsWithContent(root);
    expect(root.querySelector('.oc-print__keep')).toBeNull();
  });
});

describe('PrintService', () => {
  it('monte le contenu, imprime, puis nettoie le conteneur (navigateur)', async () => {
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

  it('ne fait rien au SSR (pas d’impression)', async () => {
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
