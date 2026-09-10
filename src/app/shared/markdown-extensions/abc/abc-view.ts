import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import DOMPurify from 'dompurify';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { abcTitle, stripMidiDirectives } from './abc-config';
import { AbcPlayback } from './abc-playback';

type Abcjs = typeof import('abcjs');
type TuneObject = import('abcjs').TuneObject;
type MidiBuffer = import('abcjs').MidiBuffer;

/**
 * Banque de sons auto-hébergée (`public/abcjs-soundfont/`). Sans elle, abcjs
 * chargerait ses notes depuis `paulrosen.github.io`.
 */
const SOUNDFONT_URL = '/abcjs-soundfont/';
/** Gain qu'abcjs n'applique qu'à SON URL par défaut ; sans lui, piano trop faible. */
const SOUNDFONT_VOLUME = 3;
/**
 * Largeur de portée : celle de la planche (padding et marges d'abcjs déduits),
 * bornée. Sans elle, abcjs grave sur 740 px puis réduit le tout — notes
 * minuscules dans une colonne étroite ; avec `wrap`, il repasse à la ligne.
 */
const STAFF_MIN = 280;
const STAFF_MAX = 740;
const STAFF_CHROME = 72;
const WRAP = { preferredMeasuresPerLine: 4, minSpacing: 1.8, maxSpacing: 2.7 };

/** abcjs est un paquet CommonJS : l'import dynamique le range sous `default`. */
async function loadAbcjs(): Promise<Abcjs> {
  const mod: unknown = await import('abcjs');
  return (mod as { default?: Abcjs }).default ?? (mod as Abcjs);
}

type AudioState = 'idle' | 'loading' | 'playing' | 'error';

/**
 * Rendu d'un fence ```abc : partition gravée en SVG par abcjs (importé au
 * premier rendu, hors bundle initial), re-sanitisée comme les autres figures
 * issues d'une lib, sur la planche claire fixe. Lecture audio au clic
 * seulement (politique d'autoplay) : `AudioContext` créé à la demande, notes
 * de piano chargées depuis l'origine, un seul lecteur actif par page
 * (`AbcPlayback`). Les avertissements de l'analyseur ABC sont listés sous la
 * partition.
 */
@Component({
  selector: 'app-abc-view',
  imports: [TranslocoPipe],
  templateUrl: './abc-view.html',
  styleUrl: './abc-view.scss',
})
export class AbcView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  protected readonly scoreEl = viewChild<ElementRef<HTMLElement>>('score');
  protected readonly title = computed(() => abcTitle(this.source()));
  protected readonly rendered = signal(false);
  protected readonly error = signal<'load' | 'empty' | null>(null);
  protected readonly warnings = signal<readonly string[]>([]);
  protected readonly audio = signal<AudioState>('idle');
  protected readonly audioSupported =
    typeof window !== 'undefined' && typeof window.AudioContext === 'function';

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #playback = inject(AbcPlayback);
  #abcjs: Abcjs | null = null;
  #tune: TuneObject | null = null;
  #synth: MidiBuffer | null = null;
  #audioContext: AudioContext | null = null;
  readonly #stop = () => this.#stopAudio();

  constructor() {
    effect((onCleanup) => {
      const source = this.source();
      const el = this.scoreEl()?.nativeElement;
      if (el === undefined) {
        return;
      }
      let stale = false;
      onCleanup(() => {
        stale = true;
        this.#stopAudio();
        el.replaceChildren();
      });
      void this.#draw(el, source, () => stale);
    });
    inject(DestroyRef).onDestroy(() => this.#stopAudio());
  }

  protected toggleAudio(): void {
    if (this.audio() === 'playing') {
      this.#stopAudio();
    } else if (this.audio() !== 'loading') {
      void this.#play();
    }
  }

  async #draw(el: HTMLElement, source: string, isStale: () => boolean): Promise<void> {
    this.rendered.set(false);
    this.error.set(null);
    this.warnings.set([]);
    this.audio.set('idle');
    this.#tune = null;
    let abcjs: Abcjs;
    try {
      abcjs = this.#abcjs ??= await loadAbcjs();
    } catch {
      if (!isStale()) {
        this.error.set('load');
      }
      return;
    }
    if (isStale()) {
      return;
    }
    // abcjs mesure le texte : il grave dans le DOM vivant, puis on re-filtre.
    // Cible jetable : abcjs pose ses styles inline sur son conteneur, ils
    // écraseraient le masquage de la planche.
    const target = el.ownerDocument.createElement('div');
    el.replaceChildren(target);
    const staffwidth = Math.min(
      STAFF_MAX,
      Math.max(STAFF_MIN, (this.#host.nativeElement.clientWidth || STAFF_MAX) - STAFF_CHROME),
    );
    const [tune] = abcjs.renderAbc(target, stripMidiDirectives(source), {
      responsive: 'resize',
      staffwidth,
      wrap: WRAP,
    });
    if (tune === undefined || tune.lines.length === 0) {
      el.replaceChildren();
      this.error.set('empty');
      return;
    }
    el.innerHTML = DOMPurify.sanitize(el.innerHTML, { USE_PROFILES: { html: true, svg: true } });
    this.#tune = tune;
    this.warnings.set(tune.warnings ?? []);
    this.rendered.set(true);
  }

  async #play(): Promise<void> {
    const abcjs = this.#abcjs;
    const tune = this.#tune;
    if (abcjs === null || tune === null) {
      return;
    }
    this.#playback.claim(this.#stop);
    this.audio.set('loading');
    try {
      const audioContext = new AudioContext();
      this.#audioContext = audioContext;
      const synth = new abcjs.synth.CreateSynth();
      this.#synth = synth;
      await synth.init({
        visualObj: tune,
        audioContext,
        millisecondsPerMeasure: tune.millisecondsPerMeasure(),
        options: { soundFontUrl: SOUNDFONT_URL, soundFontVolumeMultiplier: SOUNDFONT_VOLUME },
        onEnded: () => this.#stopAudio(),
      });
      await synth.prime();
      if (this.#synth !== synth) {
        return; // arrêté pendant le chargement des notes
      }
      synth.start();
      this.audio.set('playing');
    } catch {
      this.#stopAudio();
      this.audio.set('error');
    }
  }

  #stopAudio(): void {
    const synth = this.#synth;
    this.#synth = null;
    try {
      synth?.stop();
    } catch {
      // Lecteur jamais démarré (arrêt pendant le chargement des notes).
    }
    void this.#audioContext?.close().catch(() => undefined);
    this.#audioContext = null;
    this.#playback.release(this.#stop);
    if (this.audio() !== 'error') {
      this.audio.set('idle');
    }
  }
}
