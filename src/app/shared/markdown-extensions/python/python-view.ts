import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { RunnableCode } from '../runnable-code/runnable-code';
import { PYTHON_RUN_TIMEOUT_MS, PythonRunResult, PythonRuntime } from './python-runtime';

/**
 * Rendu d'un fence ```python : code exécutable dans le navigateur de l'élève
 * (Pyodide, `PythonRuntime`), avec numpy et matplotlib. Rien n'est téléchargé
 * avant le premier « Exécuter ». `input()` lit le champ « Entrées », une ligne
 * par appel (ouvert d'office si le code en contient un). Sortie standard,
 * erreurs (traceback réduit au code de l'élève) et figures matplotlib (PNG)
 * sous le code ; tout est rendu par le template, donc échappé.
 */
@Component({
  selector: 'app-python-view',
  imports: [RunnableCode, TranslocoPipe],
  templateUrl: './python-view.html',
  styleUrl: './python-view.scss',
})
export class PythonView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  /** Le code tel qu'écrit : seules les lignes vides finales sont retirées (l'indentation compte). */
  protected readonly code = computed(() => this.source().replace(/\s+$/, ''));
  protected readonly usesInput = computed(() => /\binput\s*\(/.test(this.source()));
  protected readonly stdin = signal('');
  protected readonly running = signal(false);
  protected readonly result = signal<PythonRunResult | null>(null);
  protected readonly timeoutSeconds = PYTHON_RUN_TIMEOUT_MS / 1000;

  readonly #runtime = inject(PythonRuntime);
  protected readonly phase = computed(() => (this.running() ? this.#runtime.phase()?.phase : null));
  #destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.#destroyed = true));
  }

  protected async run(code: string): Promise<void> {
    this.running.set(true);
    this.result.set(null);
    const lines = this.stdin() === '' ? [] : this.stdin().split('\n');
    const result = await this.#runtime.run(code, lines);
    if (this.#destroyed) {
      return;
    }
    this.result.set(result);
    this.running.set(false);
  }

  protected stop(): void {
    this.#runtime.stop();
  }

  protected editStdin(event: Event): void {
    this.stdin.set((event.target as HTMLTextAreaElement).value);
  }

  protected isEmpty(result: PythonRunResult & { status: 'ok' }): boolean {
    return !result.stdout && !result.stderr && !result.error && result.figures.length === 0;
  }

  protected waitsForInput(error: string | null): boolean {
    return error !== null && error.includes('EOFError');
  }
}
