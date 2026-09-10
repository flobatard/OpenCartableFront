import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AbcView } from './abc-view';

// jsdom ne grave pas : un faux abcjs pose un SVG (script compris, pour la
// sanitisation) et renvoie une mélodie ; « VIDE » donne une mélodie sans ligne.
const renderAbc = vi.fn((target: HTMLElement, source: string, _params?: unknown) => {
  target.innerHTML = '<svg><script>alert(1)</script><path d="M0 0"></path></svg>';
  return [
    {
      lines: source.includes('VIDE') ? [] : [{}],
      warnings: source.includes('???') ? ['Caractère inconnu'] : undefined,
      millisecondsPerMeasure: () => 2000,
    },
  ];
});
const synthInit = vi.fn((_options?: unknown) => Promise.resolve({}));
const synthStart = vi.fn();
const synthStop = vi.fn();

vi.mock('abcjs', () => ({
  default: {
    renderAbc,
    synth: {
      CreateSynth: class {
        init = synthInit;
        prime = () => Promise.resolve({ status: 'ok', duration: 1 });
        start = synthStart;
        stop = synthStop;
      },
    },
  },
}));

class FakeAudioContext {
  close = vi.fn(() => Promise.resolve());
}

async function settle(fixture: { detectChanges: () => void }): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

async function createView(source: string) {
  const fixture = TestBed.createComponent(AbcView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

const TUNE = 'X:1\nT:Au clair de la lune\n%%MIDI program 40\nK:C\nCCCD|E2D2|';

describe('AbcView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('engraves the tune without MIDI directives, sanitized, titled for AT', async () => {
    const fixture = await createView(TUNE);
    const el = fixture.nativeElement as HTMLElement;
    expect(renderAbc.mock.calls[0][1]).not.toContain('%%MIDI');
    expect(renderAbc.mock.calls[0][2]).toMatchObject({ responsive: 'resize', wrap: expect.any(Object) });
    const score = el.querySelector('.abc-view__score');
    expect(score?.querySelector('svg path')).not.toBeNull();
    expect(score?.querySelector('script')).toBeNull();
    expect(score?.getAttribute('aria-label')).toBe('Au clair de la lune');
    expect(el.querySelector('.abc-view__play')).not.toBeNull();
  });

  it('plays with the self-hosted piano soundfont, then stops', async () => {
    const fixture = await createView(TUNE);
    const button = () => (fixture.nativeElement as HTMLElement).querySelector('.abc-view__play')!;
    (button() as HTMLButtonElement).click();
    await settle(fixture);
    expect(synthInit).toHaveBeenCalledWith(
      expect.objectContaining({
        millisecondsPerMeasure: 2000,
        options: { soundFontUrl: '/abcjs-soundfont/', soundFontVolumeMultiplier: 3 },
      }),
    );
    expect(synthStart).toHaveBeenCalledOnce();
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().textContent).toContain('Arrêter');

    (button() as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(synthStop).toHaveBeenCalled();
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('starting another score stops the one playing', async () => {
    const first = await createView(TUNE);
    const second = await createView(TUNE);
    (first.nativeElement.querySelector('.abc-view__play') as HTMLButtonElement).click();
    await settle(first);
    (second.nativeElement.querySelector('.abc-view__play') as HTMLButtonElement).click();
    await settle(second);
    first.detectChanges();
    expect(synthStop).toHaveBeenCalledOnce();
    expect(first.nativeElement.querySelector('.abc-view__play').getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(second.nativeElement.querySelector('.abc-view__play').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('lists parser warnings under the score', async () => {
    const fixture = await createView('X:1\nK:C\nCDE ??? F|');
    const warnings = (fixture.nativeElement as HTMLElement).querySelector('.abc-view__warnings');
    expect(warnings?.textContent).toContain('Caractère inconnu');
  });

  it('a tune without notes shows the notice and no player', async () => {
    const fixture = await createView('X:1\nT:VIDE\nK:C');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.abc-view__error')?.textContent).toContain('Partition vide');
    expect(el.querySelector('.abc-view__score')?.classList).toContain('abc-view__score--hidden');
    expect(el.querySelector('.abc-view__play')).toBeNull();
  });
});
