import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQL_EXEC_TIMEOUT_MS, SQL_WORKER_FACTORY, SqlRuntime } from './sql-runtime';

/** Faux worker sql.js : répond comme le vrai protocole ; se tait sur « BOUCLE » ou `hang`. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: Record<string, unknown>[] = [];
  terminated = false;
  hang = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: Record<string, unknown>): void {
    this.messages.push(message);
    const sql = String(message['sql'] ?? '');
    if (this.hang || sql.includes('BOUCLE')) {
      return;
    }
    const data =
      message['action'] === 'open'
        ? { id: message['id'], ready: true }
        : sql.includes('ERREUR')
          ? { id: message['id'], error: 'near "ERREUR": syntax error' }
          : { id: message['id'], results: [{ columns: ['n'], values: [[1]] }] };
    queueMicrotask(() => this.onmessage?.({ data } as MessageEvent));
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('SqlRuntime', () => {
  let runtime: SqlRuntime;

  beforeEach(() => {
    FakeWorker.instances = [];
    TestBed.configureTestingModule({
      providers: [{ provide: SQL_WORKER_FACTORY, useValue: () => new FakeWorker() }],
    });
    runtime = TestBed.inject(SqlRuntime);
  });

  afterEach(() => vi.useRealTimers());

  it('creates the worker lazily, opens a fresh base, runs setup then query', async () => {
    expect(FakeWorker.instances).toHaveLength(0);
    const result = await runtime.run('CREATE TABLE t (n);', 'SELECT n FROM t;');
    expect(result).toEqual({ status: 'ok', results: [{ columns: ['n'], values: [[1]] }] });
    expect(FakeWorker.instances[0].messages.map((m) => m['action'] + ':' + (m['sql'] ?? ''))).toEqual([
      'open:',
      'exec:CREATE TABLE t (n);',
      'exec:SELECT n FROM t;',
    ]);
    expect(runtime.ready()).toBe(true);
    // Deuxième exécution : même worker, base rouverte.
    await runtime.run('', 'SELECT 1;');
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].messages.at(-2)?.['action']).toBe('open');
  });

  it('tells a setup error from a query error', async () => {
    expect(await runtime.run('ERREUR', 'SELECT 1;')).toEqual({
      status: 'error',
      phase: 'setup',
      message: 'near "ERREUR": syntax error',
    });
    expect(await runtime.run('', 'ERREUR')).toMatchObject({ status: 'error', phase: 'query' });
  });

  it('kills a runaway query after the timeout and recreates the worker next time', async () => {
    vi.useFakeTimers();
    const pending = runtime.run('', 'WITH RECURSIVE BOUCLE');
    await vi.advanceTimersByTimeAsync(SQL_EXEC_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ status: 'timeout' });
    expect(FakeWorker.instances[0].terminated).toBe(true);
    vi.useRealTimers();
    await runtime.run('', 'SELECT 1;');
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('stop() interrupts the running query', async () => {
    const pending = runtime.run('', 'BOUCLE');
    await new Promise((resolve) => setTimeout(resolve, 0));
    runtime.stop();
    expect(await pending).toEqual({ status: 'stopped' });
  });

  it('a worker that fails to load reports the engine as unavailable', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SQL_WORKER_FACTORY,
          useValue: () => {
            const worker = new FakeWorker();
            worker.hang = true;
            queueMicrotask(() => worker.onerror?.({ preventDefault: () => undefined } as ErrorEvent));
            return worker;
          },
        },
      ],
    });
    expect(await TestBed.inject(SqlRuntime).run('', 'SELECT 1;')).toEqual({ status: 'unavailable' });
  });
});
