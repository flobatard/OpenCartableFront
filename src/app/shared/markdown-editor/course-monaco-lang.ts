/**
 * Langages Monaco custom pour l'éditeur de cours : coloration du LaTeX dans les
 * délimiteurs `$…$` / `$$…$$` et du Mermaid dans les blocs ` ```mermaid `.
 *
 * Ce module n'importe PAS monaco (ni au runtime, ni en type) : la fonction
 * `registerCourseMonacoLanguages` reçoit l'API monaco en paramètre. Il reste
 * donc une donnée pure, testable en jsdom avec un faux monaco. En pratique il
 * n'est appelé qu'au navigateur, depuis `onMonacoLoad` du wrapper (qui ne
 * s'exécute jamais au SSR ni en jsdom : le loader AMD y est inerte).
 *
 * Choix d'archi — on enregistre un NOUVEAU langage `oc-markdown` (copie de la
 * grammaire markdown intégrée + règles math) plutôt que d'écraser `markdown` :
 * robustesse (on ne dépend que de l'API publique d'embarquement `register` +
 * `setMonarchTokensProvider` + `nextEmbedded`, pas d'un ordre interne de monaco)
 * et isolation (pas de `conf` à demi-écrasé, `markdown` reste disponible pour un
 * futur consommateur). Le Mermaid, lui, ne demande aucune modification de la
 * grammaire markdown : la règle de fence GitHub intégrée délègue déjà
 * ` ```lang ` au langage embarqué `lang` via `nextEmbedded: "$1"` — enregistrer
 * l'id `mermaid` suffit.
 *
 * Délimiteurs math : source de vérité = `core/markdown/course-markdown.ts`
 * (BLOCK_RULE / INLINE_RULE). Monarch, orienté ligne et sans backreference, ne
 * peut PAS reproduire exactement ces regex (pas de `\1`, fermeture bloc « en fin
 * de ligne ») : on vise une approximation visuelle, le renderer restant l'arbitre.
 */

/** Sous-ensemble de l'API monaco requis ici (évite un import runtime de monaco). */
export interface CourseMonacoApi {
  languages: {
    register(language: { id: string }): void;
    setMonarchTokensProvider(languageId: string, def: unknown): unknown;
    setLanguageConfiguration(languageId: string, conf: unknown): unknown;
  };
  editor: { defineTheme(name: string, theme: unknown): void };
}

// --- Grammaire LaTeX (raisonnable, non exhaustive) ---------------------------

export const latexLanguage = {
  defaultToken: '',
  tokenPostfix: '.latex',
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
  ],
  tokenizer: {
    root: [
      [/%.*$/, 'comment'],
      [/\\(?:begin|end)\b/, 'keyword.predefined'],
      [/\\[a-zA-Z@]+/, 'keyword'], // \command
      [/\\[^a-zA-Z]/, 'string.escape'], // \{ \} \$ \% \\ …
      [/[{}]/, '@brackets'],
      [/[[\]]/, '@brackets'],
      [/[\^_~&]/, 'operator'], // exposant / indice / alignement
      [/[+\-*/=<>|!]/, 'operator'],
      [/\d+(?:\.\d+)?/, 'number'],
    ],
  },
};

// --- Grammaire Mermaid (raisonnable, non exhaustive) -------------------------

export const mermaidLanguage = {
  defaultToken: '',
  tokenPostfix: '.mermaid',
  keywords: [
    'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
    'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'journey', 'gitGraph',
    'mindmap', 'timeline', 'quadrantChart', 'requirementDiagram', 'C4Context',
    'subgraph', 'end', 'participant', 'actor', 'class', 'state', 'note',
    'loop', 'alt', 'opt', 'else', 'par', 'and', 'rect', 'activate', 'deactivate',
    'section', 'title', 'direction', 'click', 'style', 'classDef', 'linkStyle',
    'call', 'link', 'over',
  ],
  directions: ['TB', 'TD', 'BT', 'RL', 'LR'],
  tokenizer: {
    root: [
      [/%%.*$/, 'comment'],
      [/"/, { token: 'string.quote', next: '@dquote' }],
      [/\[[^\]]*\]/, 'string'], // libellé de nœud [ … ]
      [/\([^)]*\)/, 'string'],
      [/\{[^}]*\}/, 'string'],
      [/\|[^|]*\|/, 'string'], // libellé d'arête |texte|
      [/[<xo]?(?:--+|==+|-\.-*|\.-+)[-.]*[>xo)]?/, 'operator'], // liens / flèches
      [/[&:;,]/, 'delimiter'],
      [/[A-Za-z_$][\w$-]*/, {
        cases: {
          '@keywords': 'keyword',
          '@directions': 'type',
          '@default': 'identifier',
        },
      }],
      [/\d+/, 'number'],
    ],
    dquote: [
      [/[^"]+/, 'string'],
      [/"/, { token: 'string.quote', next: '@pop' }],
    ],
  },
};

// --- Configuration du langage oc-markdown (copie de markdown.conf) -----------

export const ocMarkdownConf = {
  comments: { blockComment: ['<!--', '-->'] },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '`', close: '`' },
  ],
  folding: {
    markers: {
      start: new RegExp('^\\s*<!--\\s*#?region\\b.*-->'),
      end: new RegExp('^\\s*<!--\\s*#?endregion\\b.*-->'),
    },
  },
};

// --- Grammaire oc-markdown = markdown intégré (recopié) + règles math ---------
//
// Recopie fidèle de `basic-languages/markdown/markdown.js` (monaco 0.55.1). Les
// SEULS ajouts OpenCartable sont marqués « OC » : la règle de bloc math dans
// `root`, l'état `ocMathBlock`, et les règles de math en ligne dans `linecontent`.
// La grammaire markdown amont est gelée : le coût de resync est négligeable.

export const ocMarkdownLanguage = {
  defaultToken: '',
  tokenPostfix: '.md',
  // escape codes
  control: /[\\`*_[\]{}()#+\-.!]/,
  noncontrol: /[^\\`*_[\]{}()#+\-.!]/,
  escapes: /\\(?:@control)/,
  // escape codes for javascript/CSS strings
  jsescapes: /\\(?:[btnfr\\"']|[0-7][0-7]?|[0-3][0-7]{2})/,
  // non matched elements
  empty: [
    'area', 'base', 'basefont', 'br', 'col', 'frame', 'hr', 'img', 'input',
    'isindex', 'link', 'meta', 'param',
  ],
  tokenizer: {
    root: [
      // markdown tables
      [/^\s*\|/, '@rematch', '@table_header'],
      // headers (with #)
      [/^(\s{0,3})(#+)((?:[^\\#]|@escapes)+)((?:#+)?)/, ['white', 'keyword', 'keyword', 'keyword']],
      // headers (with =)
      [/^\s*(=+|-+)\s*$/, 'keyword'],
      // headers (with ***)
      [/^\s*((\*[ ]?)+)\s*$/, 'meta.separator'],
      // quote
      [/^\s*>+/, 'comment'],
      // list (starting with * or number)
      [/^\s*([*\-+:]|\d+\.)\s/, 'keyword'],
      // code block (4 spaces indent)
      [/^(\t|[ ]{4})[^ ].*$/, 'string'],
      // code block (3 tilde)
      [/^\s*~~~\s*((?:\w|[/\-#])+)?\s*$/, { token: 'string', next: '@codeblock' }],
      // github style code blocks (with backticks and language)
      [/^\s*```\s*((?:\w|[/\-#])+).*$/, { token: 'string', next: '@codeblockgh', nextEmbedded: '$1' }],
      // github style code blocks (with backticks but no language)
      [/^\s*```\s*$/, { token: 'string', next: '@codeblock' }],
      // OC — bloc math $$…$$ ancré en colonne 0 → LaTeX embarqué. Le '^' garantit
      // qu'un $$…$$ en milieu de ligne tombe plutôt dans @linecontent (math
      // « display » en ligne), comme le distingue le renderer (BLOCK_RULE = ^$$).
      [/^\$\$/, { token: 'keyword.math.delimiter', next: '@ocMathBlock', nextEmbedded: 'latex' }],
      // markup within lines
      { include: '@linecontent' },
    ],
    // OC — corps du bloc math. Règle NON ancrée (pas de '^') pour couvrir aussi le
    // cas mono-ligne `$$x^2$$` : monaco cherche la fermeture n'importe où sur la
    // ligne (search), ne donne au LaTeX que le texte AVANT, puis cette règle émet
    // le délimiteur et pop l'état ET le langage embarqué. La présence d'une règle
    // `nextEmbedded: '@pop'` est OBLIGATOIRE (sinon monaco lève au tokenize).
    ocMathBlock: [
      [/\$\$/, { token: 'keyword.math.delimiter', next: '@pop', nextEmbedded: '@pop' }],
    ],
    table_header: [
      { include: '@table_common' },
      [/[^|]+/, 'keyword.table.header'], // table header
    ],
    table_body: [{ include: '@table_common' }, { include: '@linecontent' }],
    table_common: [
      [/\s*[-:]+\s*/, { token: 'keyword', switchTo: 'table_body' }], // header-divider
      [/^\s*\|/, 'keyword.table.left'], // opening |
      [/^\s*[^|]/, '@rematch', '@pop'], // exiting
      [/^\s*$/, '@rematch', '@pop'], // exiting
      [/\|/, {
        cases: {
          '@eos': 'keyword.table.right', // closing |
          '@default': 'keyword.table.middle', // inner |
        },
      }],
    ],
    codeblock: [
      [/^\s*~~~\s*$/, { token: 'string', next: '@pop' }],
      [/^\s*```\s*$/, { token: 'string', next: '@pop' }],
      [/.*$/, 'variable.source'],
    ],
    // github style code blocks
    codeblockgh: [
      [/```\s*$/, { token: 'string', next: '@pop', nextEmbedded: '@pop' }],
      [/[^`]+/, 'variable.source'],
    ],
    linecontent: [
      // escapes
      [/&\w+;/, 'string.escape'],
      [/@escapes/, 'escape'],
      // various markup
      [/\b__([^\\_]|@escapes|_(?!_))+__\b/, 'strong'],
      [/\*\*([^\\*]|@escapes|\*(?!\*))+\*\*/, 'strong'],
      [/\b_[^_]+_\b/, 'emphasis'],
      [/\*([^\\*]|@escapes)+\*/, 'emphasis'],
      [/`([^\\`]|@escapes)+`/, 'variable'],
      // OC — math en ligne, APRÈS le code inline (pour que `$x$` reste du code).
      // `\$` littéral d'abord (hors formule le renderer rend un `$`).
      [/\\\$/, 'string.escape'],
      // `$$` AVANT `$` (délimiteur long en premier : Monarch n'a pas de \1).
      // $$…$$ display en ligne. (?!\s)/(?!\d) portent depuis le renderer et tuent
      // les faux positifs « monnaie » (« 5$ et 10$ », « $5.99 »).
      [/(\$\$)(?!\s)((?:\\.|[^\\$\n])*?[^\s$\\])(\$\$)(?!\d)/, ['keyword.math.delimiter', 'string.math', 'keyword.math.delimiter']],
      // $…$ en ligne.
      [/(\$)(?!\s)((?:\\.|[^\\$\n])*?[^\s$\\])(\$)(?!\d)/, ['keyword.math.delimiter', 'string.math', 'keyword.math.delimiter']],
      // links
      [/\{+[^}]+\}+/, 'string.target'],
      [/(!?\[)((?:[^\]\\]|@escapes)*)(\]\([^)]+\))/, ['string.link', '', 'string.link']],
      [/(!?\[)((?:[^\]\\]|@escapes)*)(\])/, 'string.link'],
      // or html
      { include: 'html' },
    ],
    // Note: it is tempting to rather switch to the real HTML mode instead of building our own here
    // but currently there is a limitation in Monarch that prevents us from doing it: The opening
    // '<' would start the HTML mode, however there is no way to jump 1 character back to let the
    // HTML mode also tokenize the opening angle bracket. Thus, even though we could jump to HTML,
    // we cannot correctly tokenize it in that mode yet.
    html: [
      // html tags
      [/<(\w+)\/>/, 'tag'],
      [/<(\w+)(-|\w)*/, {
        cases: {
          '@empty': { token: 'tag', next: '@tag.$1' },
          '@default': { token: 'tag', next: '@tag.$1' },
        },
      }],
      [/<\/(\w+)(-|\w)*\s*>/, { token: 'tag' }],
      [/<!--/, 'comment', '@comment'],
    ],
    comment: [
      [/[^<-]+/, 'comment.content'],
      [/-->/, 'comment', '@pop'],
      [/<!--/, 'comment.content.invalid'],
      [/[<-]/, 'comment.content'],
    ],
    // Almost full HTML tag matching, complete with embedded scripts & styles
    tag: [
      [/[ \t\r\n]+/, 'white'],
      [/(type)(\s*=\s*)(")([^"]+)(")/, [
        'attribute.name.html', 'delimiter.html', 'string.html',
        { token: 'string.html', switchTo: '@tag.$S2.$4' }, 'string.html',
      ]],
      [/(type)(\s*=\s*)(')([^']+)(')/, [
        'attribute.name.html', 'delimiter.html', 'string.html',
        { token: 'string.html', switchTo: '@tag.$S2.$4' }, 'string.html',
      ]],
      [/(\w+)(\s*=\s*)("[^"]*"|'[^']*')/, ['attribute.name.html', 'delimiter.html', 'string.html']],
      [/\w+/, 'attribute.name.html'],
      [/\/>/, 'tag', '@pop'],
      [/>/, {
        cases: {
          '$S2==style': { token: 'tag', switchTo: 'embeddedStyle', nextEmbedded: 'text/css' },
          '$S2==script': {
            cases: {
              $S3: { token: 'tag', switchTo: 'embeddedScript', nextEmbedded: '$S3' },
              '@default': { token: 'tag', switchTo: 'embeddedScript', nextEmbedded: 'text/javascript' },
            },
          },
          '@default': { token: 'tag', next: '@pop' },
        },
      }],
    ],
    embeddedStyle: [
      [/[^<]+/, ''],
      [/<\/style\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
      [/</, ''],
    ],
    embeddedScript: [
      [/[^<]+/, ''],
      [/<\/script\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
      [/</, ''],
    ],
  },
};

// --- Thèmes accent indigo (aperçu math distinct) -----------------------------
//
// Hex CENTRALISÉ ici : les thèmes Monaco exigent du hexadécimal — monaco ne lit
// pas les tokens CSS du design system. Même dérogation assumée que le wrapper qui
// code déjà 'vs'/'vs-dark' en dur. Valeurs alignées DESIGN_SYSTEM §4 :
// indigo-600 #4F46E5 = --color-primary (clair) ; indigo-300 #A5B4FC (sombre).
const MATH_ACCENT_LIGHT = '4F46E5';
const MATH_ACCENT_DARK = 'A5B4FC';

function defineCourseThemes(monaco: CourseMonacoApi): void {
  // Les règles de token matchent par PRÉFIXE : `keyword.math.delimiter.md`
  // (postfixe .md ajouté par la grammaire) est bien couvert par `keyword.math…`.
  monaco.editor.defineTheme('oc-vs', {
    base: 'vs',
    inherit: true,
    colors: {},
    rules: [
      { token: 'keyword.math.delimiter', foreground: MATH_ACCENT_LIGHT, fontStyle: 'bold' },
      { token: 'string.math', foreground: MATH_ACCENT_LIGHT },
    ],
  });
  monaco.editor.defineTheme('oc-vs-dark', {
    base: 'vs-dark',
    inherit: true,
    colors: {},
    rules: [
      { token: 'keyword.math.delimiter', foreground: MATH_ACCENT_DARK, fontStyle: 'bold' },
      { token: 'string.math', foreground: MATH_ACCENT_DARK },
    ],
  });
}

// --- Enregistrement ----------------------------------------------------------

/** Idempotence défensive : `onMonacoLoad` ne tire qu'une fois, mais un second
 *  éditeur monté plus tard ré-appellerait — on ne réenregistre pas. */
let registered = false;

/** Réinitialise le drapeau d'idempotence (tests uniquement). */
export function resetCourseMonacoRegistration(): void {
  registered = false;
}

/**
 * Enregistre les langages `latex`, `mermaid`, `oc-markdown` et les thèmes
 * `oc-vs`/`oc-vs-dark`. À appeler une fois, depuis `onMonacoLoad` (donc avant le
 * premier `editor.create`, donc avant toute résolution de thème).
 */
export function registerCourseMonacoLanguages(monaco: CourseMonacoApi): void {
  if (registered) {
    return;
  }
  registered = true;

  // Enregistrer les ids AVANT les providers : les cibles `nextEmbedded`
  // 'latex'/'mermaid' doivent exister quand oc-markdown tokenise.
  monaco.languages.register({ id: 'latex' });
  monaco.languages.register({ id: 'mermaid' });
  monaco.languages.register({ id: 'oc-markdown' });

  monaco.languages.setMonarchTokensProvider('latex', latexLanguage);
  monaco.languages.setMonarchTokensProvider('mermaid', mermaidLanguage);
  monaco.languages.setMonarchTokensProvider('oc-markdown', ocMarkdownLanguage);
  monaco.languages.setLanguageConfiguration('oc-markdown', ocMarkdownConf);

  defineCourseThemes(monaco);
}
