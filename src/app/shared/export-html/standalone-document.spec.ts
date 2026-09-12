import { buildStandaloneDocument, EXPORT_MODULE_FRAME_ATTR } from './standalone-document';

const build = (overrides: Partial<Parameters<typeof buildStandaloneDocument>[0]> = {}): string =>
  buildStandaloneDocument({
    title: 'Cours',
    lang: 'fr',
    styles: '.a { color: red }',
    body: '<div>contenu</div>',
    ...overrides,
  });

describe('buildStandaloneDocument', () => {
  it('produces a complete document pinned to the light theme', () => {
    const html = build();

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="fr" data-theme="light">');
    expect(html).toContain('<title>Cours</title>');
    expect(html).toContain('.a { color: red }');
    expect(html).toContain('<div class="oc-export"><div>contenu</div></div>');
  });

  it('prints a heading only when the caller gives one (course export)', () => {
    const title = '<h1 class="oc-export__title"';
    expect(build()).not.toContain(title);
    expect(build({ heading: 'Suites numériques' })).toContain(
      '<h1 class="oc-export__title">Suites numériques</h1>',
    );
    expect(build({ heading: '   ' })).not.toContain(title);
  });

  it('escapes the title and neutralises a closing style tag in the CSS', () => {
    const html = build({ title: 'Maths <3 & "co"', styles: '.a::after { content: "</style>" }' });

    expect(html).toContain('<title>Maths &lt;3 &amp; "co"</title>');
    expect(html).not.toContain('"</style>"');
    expect(html).toContain('<\\/style>');
  });

  it('embeds the resize bridge targeting the exported module frames', () => {
    const html = build();

    expect(html).toContain(`iframe[${EXPORT_MODULE_FRAME_ATTR}]`);
    expect(html).toContain("data.type !== 'oc-module:resize'");
  });
});
