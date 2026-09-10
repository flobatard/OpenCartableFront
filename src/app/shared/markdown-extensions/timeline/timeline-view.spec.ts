import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { TimelineView } from './timeline-view';

function createView(source: string): HTMLElement {
  const fixture = TestBed.createComponent(TimelineView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const texts = (el: HTMLElement, selector: string) =>
  [...el.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? '');

describe('TimelineView', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  it('draws one band per period and one dot per event, as an image', () => {
    const el = createView(
      'period=-800,476,Antiquité\nperiod=476,1492,Moyen Âge\nevent=-52,Alésia\nevent=1492,Colomb',
    );
    const svg = el.querySelector('svg.timeline__svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Frise chronologique');
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 720 \d+/);
    expect(el.querySelectorAll('rect.timeline__period')).toHaveLength(2);
    expect(el.querySelector('rect.timeline__period--1')).not.toBeNull();
    expect(el.querySelectorAll('circle.timeline__dot')).toHaveLength(2);
    expect(texts(el, 'text.timeline__label')).toEqual(['Antiquité', 'Moyen Âge', 'Alésia', 'Colomb']);
  });

  it('labels negative ticks as BCE', () => {
    const el = createView('start=-800\nend=200\nstep=200\nevent=-52,Alésia');
    expect(texts(el, 'text.timeline__tick-label')).toEqual([
      '800 av. J.-C.',
      '600 av. J.-C.',
      '400 av. J.-C.',
      '200 av. J.-C.',
      '0',
      '200',
    ]);
  });

  it('restores periods and events, dates included, in a hidden list', () => {
    const el = createView('period=-800,476,Antiquité\nevent=1789-07-14,Prise de la Bastille');
    const items = texts(el, 'ul.sr-only li').map((text) => text.replace(/\s+/g, ' '));
    expect(items).toEqual([
      'Antiquité : 800 av. J.-C. – 476',
      '1789-07-14 : Prise de la Bastille',
    ]);
  });

  it('reports ignored lines under a drawn timeline', () => {
    const el = createView('event=1789,Révolution\nevent=vers 1500,Date floue');
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.querySelector('.timeline__notice')?.textContent).toContain(
      'Lignes ignorées (syntaxe invalide) : 1',
    );
  });

  it('nothing valid: notice instead of the figure', () => {
    const el = createView('event=vers 1500,Date floue');
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('.timeline__notice')?.textContent).toContain('Frise vide');
  });
});
