/** Messages échangés entre `PythonRuntime` et `python.worker.ts` (types seuls). */

export interface PythonRunRequest {
  readonly id: number;
  readonly code: string;
  /** Lignes lues par `input()`, dans l'ordre ; épuisées → EOFError. */
  readonly stdin: readonly string[];
}

/** Étape en cours : sert au libellé d'attente et à armer le délai d'exécution. */
export type PythonPhase = 'loading-runtime' | 'loading-packages' | 'running';

export interface PythonOutput {
  readonly stdout: string;
  readonly stderr: string;
  /** Traceback nettoyé si le code a levé une exception, sinon `null`. */
  readonly error: string | null;
  /** PNG en base64, une par figure matplotlib ouverte en fin d'exécution. */
  readonly figures: readonly string[];
  readonly truncated: boolean;
}

export type PythonWorkerMessage =
  | { readonly id: number; readonly type: 'phase'; readonly phase: PythonPhase; readonly detail?: string }
  | ({ readonly id: number; readonly type: 'result' } & PythonOutput)
  | { readonly id: number; readonly type: 'unavailable'; readonly detail: string };
