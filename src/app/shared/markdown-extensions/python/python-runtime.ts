import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import type { PythonOutput, PythonPhase, PythonWorkerMessage } from './python-protocol';

/**
 * Fabrique du worker Python : worker MODULE bundlé par Angular (Pyodide 314
 * ne supporte plus les workers classiques). Token pour les specs (jsdom n'a
 * pas de `Worker`).
 */
export const PYTHON_WORKER_FACTORY = new InjectionToken<() => Worker>('PYTHON_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => () => new Worker(new URL('./python.worker', import.meta.url), { type: 'module' }),
});

export type PythonRunResult =
  | ({ readonly status: 'ok' } & PythonOutput)
  | { readonly status: 'timeout' | 'stopped' | 'unavailable' };

/** Exécution du code de l'élève (paquets déjà chargés) au-delà : worker tué. */
export const PYTHON_RUN_TIMEOUT_MS = 15_000;
/** Téléchargement de Pyodide (~6 Mo compressés) et des paquets : délai large. */
const LOAD_TIMEOUT_MS = 180_000;

class Interrupted {
  constructor(readonly status: 'timeout' | 'stopped' | 'unavailable') {}
}

interface Pending {
  readonly resolve: (output: PythonOutput) => void;
  readonly reject: (reason: Interrupted) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Interpréteur Python (Pyodide) partagé par les blocs ```python de la page,
 * créé au PREMIER « Exécuter » — jamais au montage. Service root : les vues
 * sont remontées à chaque rendu du markdown, le worker (et Python chargé)
 * survit. Exécutions sérialisées ; délai de chargement large, puis délai
 * d'exécution armé quand le worker annonce la phase `running` ; dépassement
 * ou arrêt : worker tué, recréé (et Python rechargé) à la demande suivante.
 */
@Injectable({ providedIn: 'root' })
export class PythonRuntime {
  readonly #createWorker = inject(PYTHON_WORKER_FACTORY);
  #worker: Worker | null = null;
  #nextId = 0;
  readonly #pending = new Map<number, Pending>();
  #queue: Promise<unknown> = Promise.resolve();

  /** Étape de l'exécution en cours (`null` au repos), avec son détail éventuel. */
  readonly phase = signal<{ readonly phase: PythonPhase; readonly detail?: string } | null>(null);

  run(code: string, stdin: readonly string[]): Promise<PythonRunResult> {
    const job = this.#queue.then(() => this.#run(code, stdin));
    this.#queue = job.catch(() => undefined);
    return job;
  }

  /** Arrête l'exécution en cours (le worker est tué). */
  stop(): void {
    this.#reset('stopped');
  }

  async #run(code: string, stdin: readonly string[]): Promise<PythonRunResult> {
    try {
      const output = await this.#request(code, stdin);
      return { status: 'ok', ...output };
    } catch (e) {
      if (e instanceof Interrupted) {
        return { status: e.status };
      }
      throw e;
    } finally {
      this.phase.set(null);
    }
  }

  #request(code: string, stdin: readonly string[]): Promise<PythonOutput> {
    const worker = this.#ensureWorker();
    const id = ++this.#nextId;
    return new Promise<PythonOutput>((resolve, reject) => {
      const timer = setTimeout(() => this.#reset('timeout'), LOAD_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, code, stdin: [...stdin] });
    });
  }

  #ensureWorker(): Worker {
    if (this.#worker !== null) {
      return this.#worker;
    }
    const worker = this.#createWorker();
    worker.onmessage = (event: MessageEvent<PythonWorkerMessage>) => this.#onMessage(event.data);
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      this.#reset('unavailable');
    };
    this.#worker = worker;
    return worker;
  }

  #onMessage(message: PythonWorkerMessage): void {
    const pending = this.#pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    if (message.type === 'phase') {
      this.phase.set({ phase: message.phase, detail: message.detail });
      if (message.phase === 'running') {
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => this.#reset('timeout'), PYTHON_RUN_TIMEOUT_MS);
      }
      return;
    }
    clearTimeout(pending.timer);
    this.#pending.delete(message.id);
    if (message.type === 'unavailable') {
      pending.reject(new Interrupted('unavailable'));
      return;
    }
    const { stdout, stderr, error, figures, truncated } = message;
    pending.resolve({ stdout, stderr, error, figures, truncated });
  }

  #reset(status: Interrupted['status']): void {
    this.#worker?.terminate();
    this.#worker = null;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Interrupted(status));
    }
    this.#pending.clear();
  }
}
