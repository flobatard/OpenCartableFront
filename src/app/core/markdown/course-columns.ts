/**
 * Colonnes du markdown de cours — deux contenus mis en regard, chaque colonne
 * en markdown complet (encadrés, formules, images, modules, code…) :
 *
 *   ::: columns          ← ouvrant ; ratio facultatif : `::: columns 1:2` ou `2:1`
 *   …colonne de gauche…
 *   +++                  ← séparateur
 *   …colonne de droite…
 *   :::                  ← fermeture
 *
 * Marqueurs seuls sur leur ligne : au plus 3 espaces d'indentation (au-delà,
 * c'est du code indenté), blancs de fin tolérés, `columns` sans casse, `:::` et
 * `+++` de 3 caractères ou plus. Les blocs de code (``` et ~~~, reconnus comme
 * marked les reconnaît) sont opaques ; toute ligne `:::` suivie de texte ouvre
 * un niveau refermé par un `:::` nu (divs à la Pandoc) : un conteneur imbriqué
 * reste entier dans sa colonne. Exactement un `+++` au niveau du conteneur ;
 * colonnes vides admises (l'aperçu reste stable pendant la frappe). Conteneur
 * non fermé, ratio inconnu, zéro ou deux séparateurs : rien n'est reconnu, les
 * marqueurs restent du texte visible (repli lisible, comme un type d'encadré
 * inconnu).
 *
 * Les marqueurs et les ratios sont un CONTRAT DE CONTENU — écrits dans le
 * markdown des blocs, documentés par l'aide, la page de doc, le catalogue de
 * l'assistant et le cours d'exemple (gardé côté back) : on en ajoute, on n'en
 * retire ni n'en renomme. Graphie canonique : `::: columns`, en minuscules.
 *
 * Module pur (découpage du source, jamais de HTML) : `course-markdown.ts`
 * relexe chaque colonne, produit le HTML et le sanitise avec le reste du bloc.
 */

/** Ratios des deux colonnes (parts gauche:droite) ; `1:1` = colonnes égales, le défaut. */
export const COLUMNS_RATIOS = ['1:1', '1:2', '2:1'] as const;

export type ColumnsRatio = (typeof COLUMNS_RATIOS)[number];

/** Conteneur de colonnes reconnu en tête d'un source. */
export interface ColumnsParts {
  /** Source consommé : de l'ouvrant à la fermeture, son saut de ligne compris. */
  readonly raw: string;
  readonly ratio: ColumnsRatio;
  /** Markdown de la colonne de gauche, marqueurs exclus (éventuellement vide). */
  readonly left: string;
  /** Markdown de la colonne de droite, marqueurs exclus (éventuellement vide). */
  readonly right: string;
}

/** Pré-test à coût constant : le tokenizer est essayé à chaque début de bloc. */
const OPENER_PREFIX_RE = /^ {0,3}:{3}/;
/** Ouvrant, ratio éventuel capturé (validé contre `COLUMNS_RATIOS`). */
const OPENER_RE = /^ {0,3}:{3,}[ \t]*columns(?:[ \t]+(\S+))?[ \t]*$/i;
/** `:::` nu : ferme un niveau, ou le conteneur. */
const CLOSER_RE = /^ {0,3}:{3,}[ \t]*$/;
/** `:::` (suite de deux-points maximale) suivi de texte : ouvre un niveau. */
const NESTED_OPENER_RE = /^ {0,3}:{3,}(?!:)[ \t]*\S/;
const SEPARATOR_RE = /^ {0,3}\+{3,}[ \t]*$/;
/** Ouvrant d'un bloc de code, règle de marked : pas de backtick dans l'info string. */
const FENCE_OPENER_RE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
/** Ouvrant candidat en début de ligne, pour le hint `start` de marked. */
const START_RE = /\n {0,3}:{3,}[ \t]*columns/i;

/** Ratio désigné par l'ouvrant ; absent = colonnes égales, inconnu = `null`. */
function columnsRatio(value: string | undefined): ColumnsRatio | null {
  if (value === undefined) {
    return '1:1';
  }
  return COLUMNS_RATIOS.find((ratio) => ratio === value) ?? null;
}

/** Fin (exclue) de la ligne qui commence à `start`. */
function lineEnd(src: string, start: number): number {
  const index = src.indexOf('\n', start);
  return index < 0 ? src.length : index;
}

/**
 * Reconnaît un conteneur de colonnes en TÊTE de `src` (fins de ligne `\n` :
 * marked normalise le source avant tout tokenizer). `null` : pas de conteneur
 * valide à cet endroit.
 */
export function splitColumns(src: string): ColumnsParts | null {
  if (!OPENER_PREFIX_RE.test(src)) {
    return null;
  }
  let end = lineEnd(src, 0);
  const opener = OPENER_RE.exec(src.slice(0, end));
  const ratio = opener === null ? null : columnsRatio(opener[1]);
  if (ratio === null) {
    return null;
  }

  const leftStart = end + 1;
  let leftEnd = -1;
  let rightStart = -1;
  let depth = 0;
  // Fermeture du bloc de code ouvert (même suite de caractères, puis les
  // caractères de fence et les espaces que tolère marked), sinon `null`.
  let fenceCloser: RegExp | null = null;

  for (let start = end + 1; start <= src.length; start = end + 1) {
    end = lineEnd(src, start);
    const line = src.slice(start, end);
    if (fenceCloser !== null) {
      if (fenceCloser.test(line)) {
        fenceCloser = null;
      }
      continue;
    }
    const fence = FENCE_OPENER_RE.exec(line);
    if (fence !== null) {
      fenceCloser = new RegExp(`^ {0,3}${fence[1]}[~\`]* *$`);
      continue;
    }
    if (CLOSER_RE.test(line)) {
      if (depth > 0) {
        depth--;
        continue;
      }
      if (rightStart < 0) {
        return null;
      }
      return {
        raw: src.slice(0, Math.min(end + 1, src.length)),
        ratio,
        left: src.slice(leftStart, leftEnd),
        right: src.slice(rightStart, start - 1),
      };
    }
    if (NESTED_OPENER_RE.test(line)) {
      depth++;
      continue;
    }
    if (depth === 0 && SEPARATOR_RE.test(line)) {
      if (rightStart >= 0) {
        return null;
      }
      leftEnd = start - 1;
      rightStart = end + 1;
    }
  }
  return null;
}

/**
 * Hint `start` de marked (appelé sur `src.slice(1)` pour couper un paragraphe
 * avant un conteneur collé sous lui) : position d'un ouvrant candidat en début
 * de ligne. Ancré sur `\n`, jamais `^` + drapeau `m` : un ouvrant invalide
 * serait coupé au milieu de ses deux-points. Volontairement NON validé — un
 * conteneur non fermé plus loin coûterait un parcours jusqu'à la fin du bloc à
 * chaque paragraphe ; un candidat invalide est refusionné à son paragraphe par
 * marked (`lastParagraphClipped`), sans effet visible.
 */
export function columnsStart(src: string): number | undefined {
  const match = START_RE.exec(src);
  return match === null ? undefined : match.index + 1;
}

/** Textes de remplissage des colonnes insérées, dans la langue de l'interface. */
export interface ColumnsPlaceholders {
  readonly left: string;
  readonly right: string;
}

/** Conteneur prêt à insérer, et la plage (décalages dans `text`) à sélectionner ensuite. */
export interface ColumnsSnippet {
  readonly text: string;
  readonly select: { readonly start: number; readonly end: number };
}

/**
 * Conteneur de colonnes à insérer dans l'éditeur : le texte sélectionné (lignes
 * blanches de bord retirées, indentation conservée) devient la colonne de
 * gauche, sinon un texte de remplissage. Lignes vides autour : l'ouvrant ne
 * doit jamais être absorbé par la citation, la liste ou le paragraphe qui
 * précède. La plage à sélectionner est le remplissage que le prof va taper :
 * celui de gauche, ou celui de droite quand la sélection occupe la gauche.
 */
export function buildColumnsMarkdown(
  selected: string,
  placeholders: ColumnsPlaceholders,
): ColumnsSnippet {
  const content = selected
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '');
  const hasSelection = content.trim() !== '';
  const left = hasSelection ? content : placeholders.left;
  const opener = '\n\n::: columns\n';
  const separator = '\n+++\n';
  const text = `${opener}${left}${separator}${placeholders.right}\n:::\n\n`;
  const start = hasSelection ? opener.length + left.length + separator.length : opener.length;
  const length = hasSelection ? placeholders.right.length : placeholders.left.length;
  return { text, select: { start, end: start + length } };
}
