import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PythonRunRequest, PythonWorkerMessage } from './python-protocol';
import { PYTHON_RUN_TIMEOUT_MS, PYTHON_WORKER_FACTORY, PythonRuntime } from './python-runtime';

/**
 * Faux worker : annonce les phases puis répond. `BOUCLE` ne répond jamais
 * après `running` ; `INDISPONIBLE` signale un Pyodide introuvable.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<PythonWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: PythonRunRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: PythonRunRequest): void {
    this.requests.push(request);
    const send = (data: PythonWorkerMessage) =>
      queueMicrotask(() => this.onmessage?.({ data } as MessageEvent<PythonWorkerMessage>));
    const { id, code } = request;
    if (code.includes('INDISPONIBLE')) {
      send({ id, type: 'unavailable', detail: '404' });
      return;
    }
    send({ id, type: 'phase', phase: 'loading-runtime' });
    send({ id, type: 'phase', phase: 'running' });
    if (!code.includes('BOUCLE')) {
      send({
        id,
        type: 'result',
        stdout: `sortie de ${code}\n`,
        stderr: '',
        error: null,
        figures: [],
        truncated: false,
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('PythonRuntime', () => {
  let runtime: PythonRuntime;

  beforeEach(() => {
    FakeWorker.instances = [];
    TestBed.configureTestingModule({
      providers: [{ provide: PYTHON_WORKER_FACTORY, useValue: () => new FakeWorker() }],
    });
    runtime = TestBed.inject(PythonRuntime);
  });

  afterEach(() => vi.useRealTimers());

  it('creates the worker on the first run only and relays stdin', async () => {
    expect(FakeWorker.instances).toHaveLength(0);
    const result = await runtime.run('print(1)', ['Ada']);
    expect(result).toMatchObject({ status: 'ok', stdout: 'sortie de print(1)\n', error: null });
    expect(FakeWorker.instances[0].requests[0]).toMatchObject({ code: 'print(1)', stdin: ['Ada'] });
    await runtime.run('print(2)', []);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(runtime.phase()).toBeNull();
  });

  it('arms the run timeout at the running phase, then kills the worker', async () => {
    vi.useFakeTimers();
    const pending = runtime.run('while True: BOUCLE', []);
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.phase()).toEqual({ phase: 'running', detail: undefined });
    await vi.advanceTimersByTimeAsync(PYTHON_RUN_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ status: 'timeout' });
    expect(FakeWorker.instances[0].terminated).toBe(true);
    vi.useRealTimers();
    await runtime.run('print(3)', []);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('stop() interrupts the running code', async () => {
    const pending = runtime.run('BOUCLE', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    runtime.stop();
    expect(await pending).toEqual({ status: 'stopped' });
  });

  it('reports Pyodide as unavailable when it cannot load', async () => {
    expect(await runtime.run('INDISPONIBLE', [])).toEqual({ status: 'unavailable' });
  });
});
