import { describe, expect, it } from 'vitest';
import { parseTimelineConfig } from './timeline-config';
import {
  layoutTimeline,
  niceStep,
  TIMELINE_WIDTH,
  timelineDomain,
  timelineTicks,
} from './timeline-layout';

const layout = (source: string) => layoutTimeline(parseTimelineConfig(source));

describe('timelineDomain', () => {
  it('uses start/end when set', () => {
    expect(timelineDomain(parseTimelineConfig('start=-800\nend=2000\nevent=0,Zéro'))).toEqual([
      -800, 2000,
    ]);
  });

  it('otherwise pads the extreme dates', () => {
    const [min, max] = timelineDomain(parseTimelineConfig('period=1000,2000,Mille ans')) ?? [0, 0];
    expect(min).toBeLessThan(1000);
    expect(max).toBeGreaterThan(2000);
  });

  it('a single date still gets a non-empty domain', () => {
    expect(timelineDomain(parseTimelineConfig('event=1789,Révolution'))).toEqual([1788, 1790]);
  });

  it('no date: null', () => {
    expect(timelineDomain(parseTimelineConfig('step=10'))).toBeNull();
  });
});

describe('timelineTicks', () => {
  it('honours a reasonable requested step', () => {
    expect(timelineTicks(1900, 2000, 20)).toEqual([1900, 1920, 1940, 1960, 1980, 2000]);
  });

  it('falls back to a round step when the requested one is too dense', () => {
    const ticks = timelineTicks(-800, 2000, 1);
    expect(ticks.length).toBeLessThanOrEqual(10);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.every((year) => year % 100 === 0)).toBe(true);
  });

  it('never goes under one year', () => {
    expect(timelineTicks(1914.2, 1918.8, null)).toEqual([1915, 1916, 1917, 1918]);
  });

  it('niceStep rounds up to 1, 2 or 5 × 10ⁿ', () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(120)).toBe(200);
    expect(niceStep(700)).toBe(1000);
  });
});

describe('layoutTimeline', () => {
  it('nothing valid to draw: null', () => {
    expect(layout('')).toBeNull();
    expect(layout('start=0\nend=10\nevent=500,Hors cadre')).toBeNull();
  });

  it('places events above the axis and periods below it', () => {
    const l = layout('period=-800,476,Antiquité\nevent=-52,Alésia');
    expect(l).not.toBeNull();
    const { axisY, events, periods } = l!;
    expect(events[0].labelY).toBeLessThan(axisY);
    expect(events[0].stemTop).toBeLessThan(axisY);
    expect(periods[0].y).toBeGreaterThan(axisY);
    expect(periods[0].x + periods[0].width).toBeLessThanOrEqual(TIMELINE_WIDTH);
  });

  it('overlapping periods go to separate lanes, disjoint ones share a lane', () => {
    const l = layout(
      'start=0\nend=100\nperiod=0,50,A\nperiod=20,70,B\nperiod=75,100,C',
    )!;
    const [a, b, c] = l.periods;
    expect(a.y).not.toBe(b.y);
    expect(c.y).toBe(a.y);
  });

  it('contiguous periods share a lane', () => {
    const l = layout('period=-800,476,Antiquité\nperiod=476,1492,Moyen Âge')!;
    expect(l.periods[0].y).toBe(l.periods[1].y);
  });

  it('a label too long for its band goes after it and reserves the lane', () => {
    const l = layout('start=0\nend=100\nperiod=0,2,Un libellé bien trop long\nperiod=3,10,B')!;
    expect(l.periods[0].labelX).toBeGreaterThan(l.periods[0].x + l.periods[0].width);
    expect(l.periods[0].anchor).toBe('start');
    expect(l.periods[0].y).not.toBe(l.periods[1].y);
  });

  it('near the right edge, it goes before the band instead', () => {
    const l = layout('start=0\nend=100\nperiod=95,100,Un libellé bien trop long')!;
    expect(l.periods[0].anchor).toBe('end');
    expect(l.periods[0].labelX).toBeLessThan(l.periods[0].x);
  });

  it('lays out at the measured width', () => {
    const l = layoutTimeline(parseTimelineConfig('event=1789,Révolution'), 1000)!;
    expect(l.width).toBe(1000);
    expect(l.axisX2).toBe(1000 - l.axisX1);
  });

  it('close events are stacked instead of overlapping', () => {
    const l = layout('start=1780\nend=1800\nevent=1789,Révolution\nevent=1790,Fête de la Fédération')!;
    expect(l.events[0].labelY).not.toBe(l.events[1].labelY);
  });

  it('a label near the right edge is anchored to the left of its stem', () => {
    const l = layout('start=0\nend=100\nevent=99,Un libellé assez long pour déborder')!;
    expect(l.events[0].anchor).toBe('end');
    expect(l.events[0].labelX).toBeLessThan(l.events[0].x);
  });

  it('periods are clipped to the domain and colored in turn', () => {
    const l = layout('start=0\nend=10\nperiod=-5,5,A\nperiod=5,20,B')!;
    expect(l.periods[0].x).toBe(l.axisX1);
    expect(l.periods[1].x + l.periods[1].width).toBeCloseTo(l.axisX2);
    expect(l.periods.map((p) => p.colorIndex)).toEqual([0, 1]);
  });
});
