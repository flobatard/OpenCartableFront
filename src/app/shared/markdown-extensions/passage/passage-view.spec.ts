import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { PassageView } from './passage-view';

function createView(source: string): HTMLElement {
  const fixture = TestBed.createComponent(PassageView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const texts = (el: HTMLElement, selector: string) =>
  [...el.querySelectorAll(selector)].map((node) => node.textContent ?? '');

const POEM = [
  'Maître Corbeau, sur un arbre perché,',
  '    Tenait en son bec un fromage.',
  'Maître Renard, par l’odeur alléché,',
  '    Lui tint à peu près ce langage :',
  '« Hé ! bonjour, Monsieur du Corbeau.',
  '',
  'Que vous êtes joli ! que vous me semblez beau !',
].join('\n');

describe('PassageView', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  it('renders one line per source line, verbatim, blank lines as gaps', () => {
    const el = createView(POEM);
    expect(el.querySelector('.passage')?.getAttribute('role')).toBe('group');
    expect(el.querySelector('.passage')?.getAttribute('aria-label')).toBe(
      'Texte à lignes numérotées',
    );
    const lines = texts(el, '.passage__text');
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe('    Tenait en son bec un fromage.');
    expect(el.querySelectorAll('.passage__gap')).toHaveLength(1);
  });

  it('shows the number of every fifth line only, prefixed for assistive technologies', () => {
    const el = createView(POEM);
    const numbers = texts(el, '.passage__number').map((text) => text.trim());
    expect(numbers).toEqual(['', '', '', '', 'Ligne 5', '']);
    expect(el.querySelector('.passage__number .sr-only')?.textContent).toBe('Ligne ');
  });

  it('follows start= and step=, and sizes the margin after the largest number', () => {
    const el = createView('start=98\nstep=2\nun\ndeux\ntrois');
    expect(texts(el, '.passage__number').map((text) => text.replace('Ligne', '').trim())).toEqual([
      '98',
      '',
      '100',
    ]);
    expect(
      (el.querySelector('.passage') as HTMLElement).style.getPropertyValue('--passage-gutter'),
    ).toBe('3ch');
  });

  it('an empty block shows a notice', () => {
    const el = createView('\n');
    expect(el.querySelector('.passage')).toBeNull();
    expect(el.querySelector('.passage__notice')?.textContent).toContain('Texte vide');
  });
});
