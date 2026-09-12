import { AppLang } from '../../core/i18n/language.service';
import {
  absolutizeUrls,
  EXPORT_STRIPPED_SELECTORS,
  ExportLabels,
  stripChrome,
  transformForExport,
} from './export-transform';

const LABELS: ExportLabels = {
  mediaNote: 'Média en ligne :',
  interactiveFallback: 'Contenu interactif : voir en ligne.',
  moduleFallback: 'Module interactif :',
};

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const RESOURCE_ID = '22222222-2222-4222-8222-222222222222';
const SITE = 'https://oc.example';

const stableUrl = (lang: AppLang, courseId: string, resourceId: string): string =>
  `${SITE}/${lang}/courses/${courseId}/resources/${resourceId}`;

/** Fragment détaché, comme le clone produit par le service. */
function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const run = (el: HTMLElement, courseId: string | null = COURSE_ID): void =>
  transformForExport(el, courseId, 'fr', LABELS, stableUrl, SITE);

describe('transformForExport', () => {
  it('replaces an extension that needs the network with a note', () => {
    const el = root(
      '<div data-oc-extension="geogebra" data-oc-printable="false"><iframe></iframe></div>',
    );

    run(el);

    expect(el.querySelector('[data-oc-extension]')).toBeNull();
    expect(el.querySelector('.oc-print__extension-note')?.textContent).toBe(
      LABELS.interactiveFallback,
    );
  });

  it('keeps an extension that renders to SVG', () => {
    const el = root('<div data-oc-extension="tikz" data-oc-printable="true"><svg></svg></div>');

    run(el);

    expect(el.querySelector('[data-oc-extension] svg')).not.toBeNull();
  });

  it('replaces audio, video and an embedded PDF with a note linking the stable URL', () => {
    const el = root(
      `<audio data-oc-resource-id="${RESOURCE_ID}" aria-label="Dictée"></audio>` +
        `<video data-oc-resource-id="${RESOURCE_ID}"></video>` +
        `<iframe data-oc-resource-id="${RESOURCE_ID}" title="Sujet.pdf"></iframe>`,
    );

    run(el);

    expect(el.querySelectorAll('.oc-print__media-note')).toHaveLength(3);
    expect(el.querySelector('audio')).toBeNull();
    expect(el.querySelector('iframe')).toBeNull();
    const links = [...el.querySelectorAll('.oc-print__media-note a')];
    expect(links.every((a) => a.getAttribute('href') === stableUrl('fr', COURSE_ID, RESOURCE_ID)));
    expect(el.textContent).toContain('Dictée');
  });

  it('rewrites a resource link to the stable URL and turns the download button into a link', () => {
    const el = root(
      `<a data-oc-resource-id="${RESOURCE_ID}" href="https://s3.example/presigned?x=1">Sujet</a>` +
        '<div class="course-preview-document__card">' +
        `<button class="btn btn--secondary" data-oc-resource-id="${RESOURCE_ID}">Télécharger</button>` +
        '</div>',
    );

    run(el);

    expect(el.querySelector('a[data-oc-resource-id]')?.getAttribute('href')).toBe(
      stableUrl('fr', COURSE_ID, RESOURCE_ID),
    );
    expect(el.querySelector('button')).toBeNull();
    const link = el.querySelector('.course-preview-document__card a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(stableUrl('fr', COURSE_ID, RESOURCE_ID));
    expect(link.textContent).toBe('Télécharger');
    expect(link.className).toBe('btn btn--secondary');
  });

  it('leaves images to the asynchronous pass', () => {
    const el = root(`<img data-oc-resource-id="${RESOURCE_ID}" src="https://s3.example/p.png">`);

    run(el);

    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://s3.example/p.png');
  });

  it('leaves resource elements untouched outside a course context', () => {
    const el = root(`<a data-oc-resource-id="${RESOURCE_ID}" href="./local">x</a>`);

    run(el, null);

    expect(el.querySelector('a')?.getAttribute('href')).toBe(`${SITE}/local`);
  });
});

describe('stripChrome', () => {
  it('removes every control that has no engine left in a standalone file', () => {
    const el = root(
      EXPORT_STRIPPED_SELECTORS.map(
        (selector) => `<div class="${selector.slice(1)}">chrome</div>`,
      ).join('') + '<p>contenu</p>',
    );

    stripChrome(el);

    expect(el.textContent).toBe('contenu');
  });
});

describe('absolutizeUrls', () => {
  it('resolves router links against the site URL and leaves the rest alone', () => {
    const el = root(
      '<a href="/fr/courses/1">bloc</a><a href="#anchor">a</a>' +
        '<a href="https://example.org/x">ext</a><img src="data:image/png;base64,AA">' +
        '<a href="relative/page">rel</a>',
    );

    absolutizeUrls(el, `${SITE}/`);

    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      `${SITE}/fr/courses/1`,
      '#anchor',
      'https://example.org/x',
      `${SITE}/relative/page`,
    ]);
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA');
  });

  it('does nothing without a site URL', () => {
    const el = root('<a href="/fr">x</a>');

    absolutizeUrls(el, '');

    expect(el.querySelector('a')?.getAttribute('href')).toBe('/fr');
  });
});
