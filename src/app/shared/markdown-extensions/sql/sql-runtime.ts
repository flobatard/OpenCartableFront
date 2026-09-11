import { Injectable, InjectionToken, inject, signal } from '@angular/core';

/** Worker de sql.js, copié tel quel depuis `node_modules/sql.js/dist` (angular.json). */
export const SQLJS_WORKER_URL = '/assets/sqljs/worker.sql-wasm.js';

/**
 * Fabrique du worker. CLASSIQUE, jamais `{ type: 'module' }` :
 * `worker.sql-wasm.js` n'installe son gestionnaire de messages que si
 * `importScripts` existe — en module, il ne répondrait jamais. Token pour les
 * specs (jsdom n'a pas de `Worker`).
 */
export const SQL_WORKER_FACTORY = new InjectionToken<() => Worker>('SQL_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => () => new Worker(SQLJS_WORKER_URL),
});

export interface SqlResultSet {
  readonly columns: readonly string[];
  readonly values: readonly (readonly unknown[])[];
}

export type SqlRunResult =
  | { readonly status: 'ok'; readonly results: readonly SqlResultSet[] }
  | { readonly status: 'error'; readonly phase: 'setup' | 'query'; readonly message: string }
  | { readonly status: 'timeout' | 'stopped' | 'unavailable' };

/** Une requête (ou la préparation) au-delà : worker tué (`WITH RECURSIVE` sans fin…). */
export const SQL_EXEC_TIMEOUT_MS = 5_000;
/** Ouverture de la base, premier téléchargement du moteur WASM compris. */
const OPEN_TIMEOUT_MS = 30_000;

interface WorkerReply {
  readonly id: number;
  readonly results?: SqlResultSet[];
  readonly error?: string;
}

class Interrupted {
  constructor(readonly status: 'timeout' | 'stopped' | 'unavailable') {}
}

interface Pending {
  readonly resolve: (reply: WorkerReply) => void;
  readonly reject: (reason: Interrupted) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Moteur SQLite (sql.js) partagé par tous les blocs ```sql de la page, créé
 * au PREMIER « Exécuter » — jamais au montage. Service root : les vues sont
 * remontées à chaque rendu du markdown, le worker (et son WASM) survit.
 *
 * Chaque exécution rouvre une base neuve (`open`), joue la préparation puis
 * la requête : les blocs sont indépendants. Les exécutions sont sérialisées
 * (une seule base par worker). Délai dépassé ou arrêt : le worker est tué et
 * recréé à la demande suivante.
 */
@Injectable({ providedIn: 'root' })
export class SqlRuntime {
  readonly #createWorker = inject(SQL_WORKER_FACTORY);
  #worker: Worker | null = null;
  #nextId = 0;
  readonly #pending = new Map<number, Pending>();
  #queue: Promise<unknown> = Promise.resolve();

  /** Le moteur a déjà répondu une fois (sert au libellé « chargement du moteur »). */
  readonly ready = signal(false);

  run(setup: string, query: string): Promise<SqlRunResult> {
    const job = this.#queue.then(() => this.#run(setup, query));
    this.#queue = job.catch(() => undefined);
    return job;
  }

  /** Arrête l'exécution en cours (le worker est tué). */
  stop(): void {
    this.#reset('stopped');
  }

  async #run(setup: string, query: string): Promise<SqlRunResult> {
    try {
      await this.#request({ action: 'open' }, OPEN_TIMEOUT_MS);
      this.ready.set(true);
      if (setup !== '') {
        const prepared = await this.#request({ action: 'exec', sql: setup }, SQL_EXEC_TIMEOUT_MS);
        if (prepared.error !== undefined) {
          return { status: 'error', phase: 'setup', message: prepared.error };
        }
      }
      const reply = await this.#request({ action: 'exec', sql: query }, SQL_EXEC_TIMEOUT_MS);
      if (reply.error !== undefined) {
        return { status: 'error', phase: 'query', message: reply.error };
      }
      return { status: 'ok', results: reply.results ?? [] };
    } catch (e) {
      if (e instanceof Interrupted) {
        return { status: e.status };
      }
      throw e;
    }
  }

  #request(message: Record<string, unknown>, timeoutMs: number): Promise<WorkerReply> {
    const worker = this.#ensureWorker();
    const id = ++this.#nextId;
    return new Promise<WorkerReply>((resolve, reject) => {
      const timer = setTimeout(() => this.#reset('timeout'), timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      worker.postMessage({ ...message, id });
    });
  }

  #ensureWorker(): Worker {
    if (this.#worker !== null) {
      return this.#worker;
    }
    const worker = this.#createWorker();
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const pending = this.#pending.get(event.data.id);
      if (pending !== undefined) {
        clearTimeout(pending.timer);
        this.#pending.delete(event.data.id);
        pending.resolve(event.data);
      }
    };
    // Script introuvable ou erreur non rattrapée par sql.js : moteur indisponible.
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      this.#reset('unavailable');
    };
    this.#worker = worker;
    return worker;
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
