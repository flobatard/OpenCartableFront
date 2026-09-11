import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { PythonRunResult, PythonRuntime } from './python-runtime';
import { PythonView } from './python-view';

const OK: PythonRunResult = {
  status: 'ok',
  stdout: 'Bonjour <b>Ada</b>\n',
  stderr: '',
  error: null,
  figures: ['iVBORw0KGgo='],
  truncated: false,
};

function setup(source: string, result: PythonRunResult = OK) {
  const runtime = {
    phase: signal(null),
    run: vi.fn((_code: string, _stdin: readonly string[]) => Promise.resolve(result)),
    stop: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [provideTranslocoTesting()],
    providers: [{ provide: PythonRuntime, useValue: runtime }],
  });
  const fixture = TestBed.createComponent(PythonView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const run = async () => {
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Exécuter'))!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  return { runtime, el, run, fixture };
}

describe('PythonView', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('keeps the indentation, runs nothing before the click', () => {
    const { runtime, el } = setup('for i in range(3):\n    print(i)\n\n');
    expect(el.querySelector('.runnable__code')?.textContent).toBe('for i in range(3):\n    print(i)');
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it('runs the code with the Inputs lines and renders escaped output and figures', async () => {
    const { runtime, el, run, fixture } = setup('nom = input()\nprint("Bonjour", nom)');
    const stdin = el.querySelector('.python-view__stdin') as HTMLDetailsElement;
    expect(stdin.open).toBe(true); // input() détecté
    const field = stdin.querySelector('textarea')!;
    field.value = 'Ada\n15';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await run();
    expect(runtime.run).toHaveBeenCalledWith('nom = input()\nprint("Bonjour", nom)', ['Ada', '15']);
    expect(el.querySelector('.python-view__stdout')?.textContent).toBe('Bonjour <b>Ada</b>\n');
    expect(el.querySelector('.python-view__stdout b')).toBeNull();
    const figure = el.querySelector('img.python-view__figure');
    expect(figure?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(figure?.getAttribute('alt')).toBe('Figure 1 produite par le programme');
  });

  it('without input(), the Inputs field stays folded and is sent empty', async () => {
    const { runtime, el, run } = setup('print(1)');
    expect((el.querySelector('.python-view__stdin') as HTMLDetailsElement).open).toBe(false);
    await run();
    expect(runtime.run).toHaveBeenCalledWith('print(1)', []);
  });

  it('shows the traceback, with a hint when the program waits for input', async () => {
    const { el, run } = setup('input()', {
      ...OK,
      stdout: '',
      figures: [],
      error: 'Traceback (most recent call last):\n  File "main.py", line 1, in <module>\nEOFError: EOF when reading a line',
    });
    await run();
    expect(el.querySelector('.python-view__error')?.textContent).toContain('EOFError');
    expect(el.textContent).toContain('Le programme attend une saisie');
  });

  it('reports a timeout', async () => {
    const { el, run } = setup('while True: pass', { status: 'timeout' });
    await run();
    expect(el.querySelector('.python-view__error-note')?.textContent).toContain('plus de 15 secondes');
  });
});
