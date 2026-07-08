import {
  CourseMonacoApi,
  ocMarkdownLanguage,
  registerCourseMonacoLanguages,
  resetCourseMonacoRegistration,
} from './course-monaco-lang';

/**
 * On ne teste que le CÂBLAGE : en jsdom il n'y a ni loader AMD ni MonarchTokenizer,
 * le tokenizer lui-même n'est donc pas exerçable. On vérifie qu'on enregistre bien
 * les trois langages + leurs providers + les thèmes, avec un faux monaco.
 */
function fakeMonaco() {
  const languages = {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
  };
  const editor = { defineTheme: vi.fn() };
  return { monaco: { languages, editor } as unknown as CourseMonacoApi, languages, editor };
}

describe('registerCourseMonacoLanguages', () => {
  beforeEach(() => resetCourseMonacoRegistration());

  it('enregistre latex, mermaid et oc-markdown avec un tokenizer', () => {
    const { monaco, languages } = fakeMonaco();
    registerCourseMonacoLanguages(monaco);

    const registeredIds = languages.register.mock.calls.map((c) => c[0].id);
    expect(registeredIds).toEqual(expect.arrayContaining(['latex', 'mermaid', 'oc-markdown']));

    const providered = languages.setMonarchTokensProvider.mock.calls.map((c) => c[0]);
    expect(providered).toEqual(expect.arrayContaining(['latex', 'mermaid', 'oc-markdown']));
  });

  it('applique la configuration de langage à oc-markdown', () => {
    const { monaco, languages } = fakeMonaco();
    registerCourseMonacoLanguages(monaco);

    expect(languages.setLanguageConfiguration).toHaveBeenCalledWith('oc-markdown', expect.anything());
  });

  it('définit les thèmes accent oc-vs et oc-vs-dark', () => {
    const { monaco, editor } = fakeMonaco();
    registerCourseMonacoLanguages(monaco);

    const themeNames = editor.defineTheme.mock.calls.map((c) => c[0]);
    expect(themeNames).toEqual(expect.arrayContaining(['oc-vs', 'oc-vs-dark']));
  });

  it('est idempotent : un second appel ne réenregistre pas', () => {
    const { monaco, languages } = fakeMonaco();
    registerCourseMonacoLanguages(monaco);
    registerCourseMonacoLanguages(monaco);

    // 3 langages enregistrés une seule fois malgré les deux appels.
    expect(languages.register).toHaveBeenCalledTimes(3);
  });
});

describe('ocMarkdownLanguage', () => {
  it("garde la règle de pop du bloc math (invariant que monaco impose au runtime)", () => {
    // Un état embarqué SANS règle `nextEmbedded: '@pop'` fait lever monaco au
    // tokenize ; jsdom ne l'attraperait pas → on garde l'invariant par un test de forme.
    const tokenizer = ocMarkdownLanguage.tokenizer as unknown as Record<string, unknown[]>;
    const popRule = tokenizer['ocMathBlock'][0] as [unknown, { nextEmbedded?: string }];
    expect(popRule[1].nextEmbedded).toBe('@pop');
  });

  it('place les règles de math en ligne après le code inline dans linecontent', () => {
    // `$x$` doit rester du code : la règle code inline (source `variable`) précède
    // les règles math (source string.math) dans linecontent.
    const tokenizer = ocMarkdownLanguage.tokenizer as unknown as Record<string, unknown[]>;
    const line = tokenizer['linecontent'];
    const codeIdx = line.findIndex((r) => Array.isArray(r) && r[1] === 'variable');
    const mathIdx = line.findIndex(
      (r) => Array.isArray(r) && Array.isArray(r[1]) && (r[1] as string[]).includes('string.math'),
    );
    expect(codeIdx).toBeGreaterThanOrEqual(0);
    expect(mathIdx).toBeGreaterThan(codeIdx);
  });
});
