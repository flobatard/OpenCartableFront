/**
 * Source d'un fence ```passage (texte à lignes numérotées) :
 *
 *   start=21                               # en-tête facultatif : numéro de la première ligne
 *   step=5                                 # et pas de la numérotation affichée
 *   Demain, dès l'aube, à l'heure où…      # puis le texte : une ligne de source = une ligne
 *
 * L'en-tête n'est lu qu'en tête du bloc, ligne par ligne (`start=` ou `step=`
 * suivi d'un entier) : la première ligne qui n'en est pas une ouvre le texte,
 * et tout ce qui suit est du texte — même une ligne `step=5`. Les lignes vides
 * séparent strophes et paragraphes sans être comptées ; les blancs de fin de
 * ligne sont retirés, ceux de début (vers en retrait) conservés. Un numéro
 * s'affiche sur chaque ligne multiple du pas, comme dans les éditions. Module
 * pur, jamais d'exception : une valeur hors bornes garde le défaut.
 */

/** Pas de numérotation par défaut : « l. 5, 10, 15… ». */
export const PASSAGE_DEFAULT_STEP = 5;

const MAX_START = 99_999;
const MAX_STEP = 100;
const HEADER_RE = /^(start|step)\s*=\s*(\d+)$/;

/** Ligne du texte, numérotée ; `labelled` : son numéro s'affiche. */
export interface PassageLine {
  readonly kind: 'line';
  readonly number: number;
  readonly text: string;
  readonly labelled: boolean;
}

/** Ligne vide : saut de strophe ou de paragraphe, jamais comptée. */
export interface PassageGap {
  readonly kind: 'gap';
}

export interface PassageConfig {
  readonly rows: readonly (PassageLine | PassageGap)[];
  /** Numéro de la dernière ligne (largeur de la marge) ; 0 sans aucune ligne. */
  readonly lastNumber: number;
}

/** Parse la source du fence en lignes numérotées. */
export function parsePassageConfig(source: string): PassageConfig {
  const lines = source.split('\n').map((line) => line.trimEnd());
  const isBlank = (index: number) => lines[index].trim() === '';

  let from = 0;
  while (from < lines.length && isBlank(from)) {
    from++;
  }
  let start = 1;
  let step = PASSAGE_DEFAULT_STEP;
  for (; from < lines.length; from++) {
    const header = HEADER_RE.exec(lines[from].trim());
    if (header === null) {
      break;
    }
    const value = Number.parseInt(header[2], 10);
    if (header[1] === 'start' && value >= 1 && value <= MAX_START) {
      start = value;
    } else if (header[1] === 'step' && value >= 1 && value <= MAX_STEP) {
      step = value;
    }
  }
  let to = lines.length;
  while (to > from && isBlank(to - 1)) {
    to--;
  }
  while (from < to && isBlank(from)) {
    from++;
  }

  const rows: (PassageLine | PassageGap)[] = [];
  let count = 0;
  for (const text of lines.slice(from, to)) {
    if (text.trim() === '') {
      rows.push({ kind: 'gap' });
      continue;
    }
    const number = start + count++;
    rows.push({ kind: 'line', number, text, labelled: number % step === 0 });
  }
  return { rows, lastNumber: count === 0 ? 0 : start + count - 1 };
}
