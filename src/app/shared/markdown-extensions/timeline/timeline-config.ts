import { parseExtensionConfig } from '../extension-config';

/**
 * Configuration d'un fence ```timeline (frise chronologique) :
 *
 *   start=-800                        # borne gauche (optionnelle)
 *   end=2000                          # borne droite (optionnelle)
 *   step=100                          # pas des graduations, en années (optionnel)
 *   period=-800,476,Antiquité         # répétable : début,fin,libellé
 *   event=1789-07-14,Prise de la Bastille   # répétable : date,libellé
 *
 * Dates : `AAAA` (négative = avant J.-C.), `AAAA-MM` ou `AAAA-MM-JJ`, converties
 * en année fractionnaire — l'axe est continu, sans « an 0 » historique. Le
 * libellé est tout ce qui suit les virgules structurelles (il peut donc en
 * contenir). Les lignes invalides sont ignorées et comptées, jamais d'exception.
 */

/**
 * Date telle qu'écrite, pour la liste accessible : une année négative seule
 * est restituée « <text> av. J.-C. » (`bce`), tout le reste tel quel.
 */
export interface TimelineDateText {
  readonly bce: boolean;
  readonly text: string;
}

export interface TimelinePeriod {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly from: TimelineDateText;
  readonly to: TimelineDateText;
}

export interface TimelineEvent {
  readonly at: number;
  readonly label: string;
  readonly date: TimelineDateText;
}

export interface TimelineConfig {
  readonly periods: readonly TimelinePeriod[];
  readonly events: readonly TimelineEvent[];
  readonly start: number | null;
  readonly end: number | null;
  readonly step: number | null;
  /** Lignes non vides, hors commentaires, qui n'ont rien produit. */
  readonly ignored: number;
}

const DATE_RE = /^(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const DAYS_PER_YEAR = 365.25;

/** `AAAA`, `AAAA-MM` ou `AAAA-MM-JJ` → année fractionnaire, sinon `null`. */
export function parseTimelineDate(raw: string): number | null {
  const match = DATE_RE.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = match[2] === undefined ? 1 : Number.parseInt(match[2], 10);
  const day = match[3] === undefined ? 1 : Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dayOfYear = (month - 1) * (DAYS_PER_YEAR / 12) + (day - 1);
  return year + dayOfYear / DAYS_PER_YEAR;
}

function dateText(raw: string): TimelineDateText {
  const text = raw.trim();
  return /^-\d+$/.test(text) ? { bce: true, text: text.slice(1) } : { bce: false, text };
}

/** Parse la source du fence en configuration sûre. */
export function parseTimelineConfig(source: string): TimelineConfig {
  const periods: TimelinePeriod[] = [];
  const events: TimelineEvent[] = [];
  let start: number | null = null;
  let end: number | null = null;
  let step: number | null = null;
  let accepted = 0;

  for (const { key, value } of parseExtensionConfig(source)) {
    if (key === 'period') {
      const period = parsePeriod(value);
      if (period !== null) {
        periods.push(period);
        accepted++;
      }
    } else if (key === 'event') {
      const event = parseEvent(value);
      if (event !== null) {
        events.push(event);
        accepted++;
      }
    } else if (key === 'start' || key === 'end') {
      const date = parseTimelineDate(value);
      if (date !== null) {
        if (key === 'start') {
          start = date;
        } else {
          end = date;
        }
        accepted++;
      }
    } else if (key === 'step') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        step = parsed;
        accepted++;
      }
    }
  }

  const meaningful = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#')).length;
  return { periods, events, start, end, step, ignored: Math.max(0, meaningful - accepted) };
}

/** `début,fin,libellé` → période (début < fin, libellé non vide), sinon `null`. */
function parsePeriod(value: string): TimelinePeriod | null {
  const [rawStart, rawEnd, ...rest] = value.split(',');
  const label = rest.join(',').trim();
  if (rawEnd === undefined || label === '') {
    return null;
  }
  const start = parseTimelineDate(rawStart);
  const end = parseTimelineDate(rawEnd);
  return start !== null && end !== null && start < end
    ? { start, end, label, from: dateText(rawStart), to: dateText(rawEnd) }
    : null;
}

/** `date,libellé` → événement (libellé non vide), sinon `null`. */
function parseEvent(value: string): TimelineEvent | null {
  const comma = value.indexOf(',');
  if (comma < 0) {
    return null;
  }
  const date = value.slice(0, comma).trim();
  const label = value.slice(comma + 1).trim();
  const at = parseTimelineDate(date);
  return at !== null && label !== '' ? { at, label, date: dateText(date) } : null;
}
