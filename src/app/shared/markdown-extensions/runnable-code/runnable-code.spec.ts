import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { RunnableCode } from './runnable-code';

function create(running = false) {
  const fixture = TestBed.createComponent(RunnableCode);
  fixture.componentRef.setInput('code', 'SELECT 1;');
  fixture.componentRef.setInput('label', 'Requête SQL');
  fixture.componentRef.setInput('running', running);
  const runs: string[] = [];
  let stops = 0;
  fixture.componentInstance.runRequested.subscribe((code) => runs.push(code));
  fixture.componentInstance.stopRequested.subscribe(() => stops++);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as
      | HTMLButtonElement
      | undefined;
  return { fixture, el, button, runs, stops: () => stops };
}

describe('RunnableCode', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  it('shows the code read-only and runs it', () => {
    const { el, button, runs } = create();
    expect(el.querySelector('pre.runnable__code')?.textContent).toBe('SELECT 1;');
    expect(el.querySelector('textarea')).toBeNull();
    button('Exécuter')!.click();
    expect(runs).toEqual(['SELECT 1;']);
  });

  it('lets the student edit, run the edited code and reset it', () => {
    const { fixture, el, button, runs } = create();
    button('Modifier')!.click();
    fixture.detectChanges();
    const editor = el.querySelector('textarea')!;
    expect(editor.getAttribute('aria-label')).toBe('Requête SQL');
    editor.value = 'SELECT 2;';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(runs).toEqual(['SELECT 2;']);
    button('Réinitialiser')!.click();
    fixture.detectChanges();
    expect(el.querySelector('textarea')!.value).toBe('SELECT 1;');
    expect(button('Réinitialiser')).toBeUndefined();
  });

  it('while running: a Stop button instead of Run', () => {
    const { button, stops } = create(true);
    expect(button('Exécuter')).toBeUndefined();
    button('Arrêter')!.click();
    expect(stops()).toBe(1);
  });
});
