import { describe, expect, it } from 'vitest';
import { parseTimelineConfig, parseTimelineDate } from './timeline-config';

describe('parseTimelineDate', () => {
  it('reads a year, negative years being BCE', () => {
    expect(parseTimelineDate('1789')).toBe(1789);
    expect(parseTimelineDate('-52')).toBe(-52);
    expect(parseTimelineDate(' 476 ')).toBe(476);
  });

  it('reads months and days as a fraction of the year', () => {
    expect(parseTimelineDate('1914-01')).toBe(1914);
    const bastille = parseTimelineDate('1789-07-14') ?? 0;
    expect(bastille).toBeGreaterThan(1789.5);
    expect(bastille).toBeLessThan(1789.6);
  });

  it('rejects anything else', () => {
    for (const raw of ['', 'abc', '1789-13', '1789-00', '1789-07-32', '12345', '1789/07', '1.5']) {
      expect(parseTimelineDate(raw)).toBeNull();
    }
  });
});

describe('parseTimelineConfig', () => {
  it('parses periods, events and the optional bounds', () => {
    const config = parseTimelineConfig(
      [
        'start=-800',
        'end=2000',
        'step=100',
        'period=-800,476,Antiquité',
        'event=1789-07-14,Prise de la Bastille',
      ].join('\n'),
    );
    expect(config.start).toBe(-800);
    expect(config.end).toBe(2000);
    expect(config.step).toBe(100);
    expect(config.periods).toEqual([
      {
        start: -800,
        end: 476,
        label: 'Antiquité',
        from: { bce: true, text: '800' },
        to: { bce: false, text: '476' },
      },
    ]);
    expect(config.events).toHaveLength(1);
    expect(config.events[0]).toMatchObject({
      label: 'Prise de la Bastille',
      date: { bce: false, text: '1789-07-14' },
    });
    expect(config.ignored).toBe(0);
  });

  it('keeps the commas of a label', () => {
    const config = parseTimelineConfig('event=1515,Marignan, victoire de François Ier');
    expect(config.events[0].label).toBe('Marignan, victoire de François Ier');
    const period = parseTimelineConfig('period=1914,1918,Guerre, dite « Grande »');
    expect(period.periods[0].label).toBe('Guerre, dite « Grande »');
  });

  it('counts invalid lines as ignored, never comments or blank lines', () => {
    const config = parseTimelineConfig(
      [
        '# une frise',
        '',
        'period=476,-800,À l’envers',
        'period=1,2',
        'event=vers 1500,Date floue',
        'event=1500',
        'step=-5',
        'couleur=rouge',
        'sans égal',
        'event=1492,Christophe Colomb',
      ].join('\n'),
    );
    expect(config.events).toHaveLength(1);
    expect(config.periods).toHaveLength(0);
    expect(config.step).toBeNull();
    expect(config.ignored).toBe(7);
  });

  it('empty source: nothing to draw, nothing ignored', () => {
    expect(parseTimelineConfig('')).toEqual({
      periods: [],
      events: [],
      start: null,
      end: null,
      step: null,
      ignored: 0,
    });
  });
});
