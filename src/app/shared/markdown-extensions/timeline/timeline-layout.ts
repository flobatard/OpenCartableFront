import { TimelineConfig } from './timeline-config';

/**
 * Mise en page d'une frise, en unités de `viewBox` — la vue les fait coïncider
 * avec des pixels en passant la largeur mesurée de son conteneur (texte à
 * taille fixe) ; l'impression met ensuite le SVG à l'échelle. Module pur :
 * aucune mesure DOM — la largeur des libellés est estimée, par excès, depuis
 * leur nombre de caractères.
 *
 * Événements au-dessus de l'axe, périodes en bandes dessous ; chaque famille
 * est répartie en couloirs gloutons : un élément (bande ou libellé, le plus
 * large des deux) prend le premier couloir libre à sa gauche, sinon en ouvre un.
 */

/** Largeur par défaut, avant toute mesure du conteneur. */
export const TIMELINE_WIDTH = 720;
/** En deçà, le conteneur défile plutôt que d'écraser la frise. */
export const TIMELINE_MIN_WIDTH = 480;
/** Nombre de teintes de période (classes `timeline__period--<i>`). */
export const TIMELINE_COLORS = 5;

const MARGIN_X = 16;
const FONT_SIZE = 14;
/** Largeur moyenne d'un caractère, surestimée : mieux vaut un couloir de trop qu'un chevauchement. */
const CHAR_WIDTH = FONT_SIZE * 0.6;
const LABEL_PAD = 6;
const LANE_GAP = 10;
const MAX_LANES = 20;
const EVENT_LANE = 22;
const PERIOD_HEIGHT = 26;
const PERIOD_LANE = PERIOD_HEIGHT + 6;
/** Suffixe ajouté aux années négatives (« av. J.-C. »), estimé pour la densité des graduations. */
const BCE_EXTRA_CHARS = 9;

export interface TimelineTick {
  readonly x: number;
  readonly year: number;
}

export interface PlacedPeriod {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: 'start' | 'end';
  readonly colorIndex: number;
}

export interface PlacedEvent {
  readonly x: number;
  readonly label: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: 'start' | 'end';
  /** Haut de la tige (l'axe en est le bas). */
  readonly stemTop: number;
}

export interface TimelineLayout {
  readonly width: number;
  readonly height: number;
  readonly axisY: number;
  readonly axisX1: number;
  readonly axisX2: number;
  readonly tickLabelY: number;
  readonly ticks: readonly TimelineTick[];
  readonly periods: readonly PlacedPeriod[];
  readonly events: readonly PlacedEvent[];
}

/** Frise à dessiner, ou `null` s'il n'y a rien de valide dans le domaine. */
export function layoutTimeline(
  config: TimelineConfig,
  width: number = TIMELINE_WIDTH,
): TimelineLayout | null {
  const domain = timelineDomain(config);
  if (domain === null) {
    return null;
  }
  const [min, max] = domain;
  const innerWidth = width - 2 * MARGIN_X;
  const xOf = (date: number) => MARGIN_X + ((date - min) / (max - min)) * innerWidth;

  const periods = config.periods
    .filter((p) => p.end > min && p.start < max)
    .map((p, index) => ({
      x0: xOf(Math.max(p.start, min)),
      x1: xOf(Math.min(p.end, max)),
      label: p.label,
      colorIndex: index % TIMELINE_COLORS,
    }));
  const events = config.events
    .filter((e) => e.at >= min && e.at <= max)
    .map((e) => ({ x: xOf(e.at), label: e.label }));
  if (periods.length === 0 && events.length === 0) {
    return null;
  }

  // Événements : libellé à droite de la tige, à gauche s'il sortirait du cadre.
  const eventSpans = events.map((e) => {
    const w = textWidth(e.label);
    const toRight = e.x + LABEL_PAD + w <= width - MARGIN_X;
    return {
      ...e,
      anchor: toRight ? ('start' as const) : ('end' as const),
      left: toRight ? e.x : e.x - LABEL_PAD - w,
      right: toRight ? e.x + LABEL_PAD + w : e.x,
    };
  });
  const eventLanes = assignLanes(eventSpans, LANE_GAP);
  const eventLaneCount = eventSpans.length === 0 ? 0 : Math.max(...eventLanes) + 1;

  // Périodes : libellé dans la bande s'il y tient, sinon juste après elle, ou
  // juste avant en bord de cadre ; le couloir est réservé d'autant (marge
  // comprise). Deux bandes contiguës (476 → 476) partagent un couloir.
  const periodSpans = periods.map((p) => {
    const x1 = Math.max(p.x1, p.x0 + 2);
    const w = textWidth(p.label);
    if (p.x0 + 2 * LABEL_PAD + w <= x1) {
      return { ...p, x1, placement: 'inside' as const, left: p.x0, right: x1 };
    }
    if (x1 + LABEL_PAD + w <= width - MARGIN_X || p.x0 - LABEL_PAD - w < MARGIN_X) {
      return { ...p, x1, placement: 'after' as const, left: p.x0, right: x1 + LABEL_PAD + w + LANE_GAP };
    }
    return { ...p, x1, placement: 'before' as const, left: p.x0 - LABEL_PAD - w - LANE_GAP, right: x1 };
  });
  const periodLanes = assignLanes(periodSpans, 0);
  const periodLaneCount = periodSpans.length === 0 ? 0 : Math.max(...periodLanes) + 1;

  const axisY = 8 + eventLaneCount * EVENT_LANE + (eventLaneCount > 0 ? 16 : 8);
  const tickLabelY = axisY + 18;
  const periodsTop = axisY + 30;
  const height =
    periodLaneCount > 0 ? periodsTop + periodLaneCount * PERIOD_LANE + 2 : tickLabelY + 8;

  return {
    width,
    height,
    axisY,
    axisX1: MARGIN_X,
    axisX2: width - MARGIN_X,
    tickLabelY,
    ticks: timelineTicks(min, max, config.step, width).map((year) => ({ x: xOf(year), year })),
    events: eventSpans.map((e, i) => {
      const labelY = axisY - 16 - eventLanes[i] * EVENT_LANE;
      return {
        x: e.x,
        label: e.label,
        labelX: e.anchor === 'start' ? e.x + LABEL_PAD : e.x - LABEL_PAD,
        labelY,
        anchor: e.anchor,
        stemTop: labelY - FONT_SIZE + 4,
      };
    }),
    periods: periodSpans.map((p, i) => {
      const y = periodsTop + periodLanes[i] * PERIOD_LANE;
      return {
        x: p.x0,
        y,
        width: p.x1 - p.x0,
        height: PERIOD_HEIGHT,
        label: p.label,
        labelX:
          p.placement === 'inside'
            ? p.x0 + LABEL_PAD
            : p.placement === 'after'
              ? p.x1 + LABEL_PAD
              : p.x0 - LABEL_PAD,
        labelY: y + PERIOD_HEIGHT / 2 + FONT_SIZE * 0.35,
        anchor: p.placement === 'before' ? ('end' as const) : ('start' as const),
        colorIndex: p.colorIndex,
      };
    }),
  };
}

/**
 * Bornes de l'axe : `start`/`end` s'ils sont posés (et ordonnés), sinon les
 * dates extrêmes avec une petite marge ; `null` sans aucune date.
 */
export function timelineDomain(config: TimelineConfig): [number, number] | null {
  const dates = [
    ...config.periods.flatMap((p) => [p.start, p.end]),
    ...config.events.map((e) => e.at),
  ];
  if (dates.length === 0) {
    return null;
  }
  const lo = Math.min(...dates);
  const hi = Math.max(...dates);
  const pad = hi > lo ? (hi - lo) * 0.04 : 1;
  const min = config.start ?? lo - pad;
  const max = config.end ?? hi + pad;
  return min < max ? [min, max] : [lo - pad, hi + pad];
}

/**
 * Graduations en années entières : le pas demandé s'il ne produit pas une
 * forêt de traits, sinon un pas « rond » (1, 2 ou 5 × 10ⁿ) calibré sur la
 * largeur des libellés.
 */
export function timelineTicks(
  min: number,
  max: number,
  step: number | null,
  width: number = TIMELINE_WIDTH,
): number[] {
  const span = max - min;
  const labelChars = Math.max(...[min, max].map((y) => tickLabelChars(Math.trunc(y))));
  const room = Math.floor((width - 2 * MARGIN_X) / (labelChars * CHAR_WIDTH + 24));
  const target = Math.min(10, Math.max(2, room));
  const effective =
    step !== null && Number.isInteger(step) && span / step <= 50 ? step : niceStep(span / target);
  const ticks: number[] = [];
  for (let year = Math.ceil(min / effective) * effective; year <= max; year += effective) {
    ticks.push(year);
  }
  return ticks;
}

/** Plus petit pas de la forme 1, 2 ou 5 × 10ⁿ au moins égal à `raw` — jamais sous l'année. */
export function niceStep(raw: number): number {
  if (!(raw > 1)) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw);
  return step ?? 10 * magnitude;
}

function tickLabelChars(year: number): number {
  const digits = String(Math.abs(year)).length;
  return year < 0 ? digits + BCE_EXTRA_CHARS : digits;
}

function textWidth(label: string): number {
  return [...label].length * CHAR_WIDTH;
}

/** Couloir de chaque intervalle (ordre d'origine), par premier ajustement de gauche à droite. */
function assignLanes(spans: readonly { left: number; right: number }[], gap: number): number[] {
  const lanes = new Array<number>(spans.length).fill(0);
  const laneEnds: number[] = [];
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].left - spans[b].left);
  for (const i of order) {
    let lane = laneEnds.findIndex((end) => end + gap <= spans[i].left);
    if (lane < 0) {
      lane = laneEnds.length < MAX_LANES ? laneEnds.length : MAX_LANES - 1;
    }
    laneEnds[lane] = Math.max(laneEnds[lane] ?? -Infinity, spans[i].right);
    lanes[i] = lane;
  }
  return lanes;
}
