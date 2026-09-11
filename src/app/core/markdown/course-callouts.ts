import { Token, Tokens } from 'marked';

/**
 * Encadrés pédagogiques du markdown de cours — syntaxe des alertes GitHub
 * (`> [!NOTE]`), étendue aux types des supports de cours :
 *
 *   > [!DEFINITION] Fonction affine     ← marqueur, puis titre facultatif
 *   > Une fonction affine est…          ← contenu : markdown complet
 *
 * Le marqueur ouvre la PREMIÈRE ligne d'une citation ; le texte qui le suit
 * sur cette ligne remplace le titre par défaut (libellé du type, dans la
 * langue de l'interface). Mot-clé insensible à la casse, aux accents et aux
 * espaces (`[!Méthode]`, `[!À retenir]`) ; les cinq mots-clés GitHub sont des
 * alias. Type inconnu ou marqueur ailleurs qu'en tête : la citation reste une
 * citation, marqueur visible (repli lisible, rien n'est perdu).
 *
 * Les mots-clés sont un CONTRAT DE CONTENU — écrits dans le markdown des
 * blocs, cités par le catalogue de l'assistant et gardés par les tests du
 * cours d'exemple côté back : on en ajoute, on n'en retire ni n'en renomme.
 * Les types, eux, sont des clés internes (classes CSS, clés i18n) : les
 * mots-clés français de la syntaxe y sont traduits.
 *
 * Module pur (découpage des tokens marked d'une citation) : le HTML est
 * produit par `course-markdown.ts` et sanitisé avec le reste du bloc.
 */

/** Types d'encadré, dans l'ordre de la documentation. */
export const CALLOUT_KINDS = [
  'definition',
  'keypoint',
  'method',
  'example',
  'note',
  'warning',
] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/** Titre par défaut de chaque type, dans la langue de l'interface. */
export type CalloutTitles = Readonly<Record<CalloutKind, string>>;

/**
 * Titres de repli (langue de repli de l'application) quand l'appelant n'en
 * fournit pas — miroir de `markdownView.callouts` en français, gardé par la
 * spec.
 */
export const CALLOUT_FALLBACK_TITLES: CalloutTitles = {
  definition: 'Définition',
  keypoint: 'À retenir',
  method: 'Méthode',
  example: 'Exemple',
  note: 'Remarque',
  warning: 'Attention',
};

/** Mot-clé normalisé (majuscules, sans accent, espaces simples) → type. */
const KEYWORDS: ReadonlyMap<string, CalloutKind> = new Map([
  ['DEFINITION', 'definition'],
  ['RETENIR', 'keypoint'],
  ['A RETENIR', 'keypoint'],
  ['METHODE', 'method'],
  ['EXEMPLE', 'example'],
  ['REMARQUE', 'note'],
  ['ATTENTION', 'warning'],
  // Alertes GitHub, et graphies anglaises des mots-clés sans équivalent GitHub.
  ['NOTE', 'note'],
  ['TIP', 'method'],
  ['IMPORTANT', 'keypoint'],
  ['WARNING', 'warning'],
  ['CAUTION', 'warning'],
  ['EXAMPLE', 'example'],
  ['METHOD', 'method'],
]);

/** Marqueur en tête de citation, espaces qui le suivent compris. */
const MARKER_RE = /^\[!([^\]\n]{1,32})\][ \t]*/;

/** Type désigné par un mot-clé (casse, accents et espaces indifférents), sinon `null`. */
export function calloutKind(keyword: string): CalloutKind | null {
  const normalized = keyword
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  return KEYWORDS.get(normalized) ?? null;
}

/** Titres depuis une traduction (`markdownView.callouts`) ; clé absente ou vide → repli. */
export function resolveCalloutTitles(
  translation: Readonly<Record<string, unknown>>,
): CalloutTitles {
  const titles: Record<CalloutKind, string> = { ...CALLOUT_FALLBACK_TITLES };
  for (const kind of CALLOUT_KINDS) {
    const value = translation[kind];
    if (typeof value === 'string' && value.trim() !== '') {
      titles[kind] = value;
    }
  }
  return titles;
}

/** Encadré reconnu dans une citation. */
export interface CalloutParts {
  readonly kind: CalloutKind;
  /** Titre personnalisé, en tokens en ligne ; vide = titre par défaut du type. */
  readonly titleTokens: Token[];
  /** Contenu : tokens de bloc de la citation, marqueur et titre retirés. */
  readonly bodyTokens: Token[];
}

/**
 * Reconnaît un encadré dans les tokens d'une citation (`Tokens.Blockquote`) :
 * le premier est un paragraphe dont le texte commence par le marqueur. La
 * première ligne de ce paragraphe — jusqu'au premier saut de ligne ou `<br>`,
 * quel que soit le token qui le porte — est le titre ; la suite du paragraphe
 * ouvre le contenu. `null` : citation ordinaire.
 */
export function splitCallout(tokens: readonly Token[]): CalloutParts | null {
  const [first, ...blocks] = tokens;
  if (first?.type !== 'paragraph') {
    return null;
  }
  const inline = (first as Tokens.Paragraph).tokens;
  if (inline[0]?.type !== 'text') {
    return null;
  }
  const head = inline[0] as Tokens.Text;
  const marker = MARKER_RE.exec(head.text);
  const kind = marker === null ? null : calloutKind(marker[1]);
  if (marker === null || kind === null) {
    return null;
  }

  const rest: Token[] = [textPart(head, head.text.slice(marker[0].length)), ...inline.slice(1)];
  const title: Token[] = [];
  let body: Token[] = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.type === 'br') {
      body = rest.slice(i + 1);
      break;
    }
    const text = token.type === 'text' ? (token as Tokens.Text) : null;
    const cut = text?.text.indexOf('\n') ?? -1;
    if (text !== null && cut >= 0) {
      title.push(textPart(text, text.text.slice(0, cut)));
      body = [textPart(text, text.text.slice(cut + 1)), ...rest.slice(i + 1)];
      break;
    }
    title.push(token);
  }

  const titleTokens = trimInline(title);
  const bodyInline = trimInline(body);
  const bodyTokens: Token[] =
    bodyInline.length === 0
      ? blocks
      : [{ type: 'paragraph', raw: '', text: '', tokens: bodyInline }, ...blocks];
  return { kind, titleTokens, bodyTokens };
}

/** Morceau d'un token texte en ligne (jamais de `tokens` imbriqués dans un paragraphe). */
function textPart(token: Tokens.Text, text: string): Tokens.Text {
  return { type: 'text', raw: text, text, escaped: token.escaped };
}

/**
 * Retire les blancs aux deux bouts d'une suite de tokens en ligne ; une suite
 * qui ne contient que des blancs devient vide.
 */
function trimInline(tokens: readonly Token[]): Token[] {
  const trimmed = [...tokens];
  const textAt = (index: number): Tokens.Text | null =>
    trimmed[index]?.type === 'text' ? (trimmed[index] as Tokens.Text) : null;
  while (trimmed.length > 0 && textAt(0)?.text.trim() === '') {
    trimmed.shift();
  }
  while (trimmed.length > 0 && textAt(trimmed.length - 1)?.text.trim() === '') {
    trimmed.pop();
  }
  const first = textAt(0);
  if (first !== null) {
    trimmed[0] = textPart(first, first.text.trimStart());
  }
  const last = textAt(trimmed.length - 1);
  if (last !== null) {
    trimmed[trimmed.length - 1] = textPart(last, last.text.trimEnd());
  }
  return trimmed;
}
