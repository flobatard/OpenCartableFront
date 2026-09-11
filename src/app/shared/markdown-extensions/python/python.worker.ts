/**
 * Worker d'exécution Python (Pyodide), créé par `PythonRuntime` au premier
 * « Exécuter ». Bundlé par Angular (`worker-<hash>.js`, servi avec une CSP
 * d'en-tête qui n'autorise que l'origine — cf. static-headers.ts) ; Pyodide
 * lui-même est chargé À L'EXÉCUTION depuis /assets/pyodide/ (import d'une URL
 * variable, jamais résolu par le bundler).
 *
 * - `MPLBACKEND=Agg` : le backend matplotlib par défaut de Pyodide appelle
 *   `document`, absent d'un worker.
 * - Le lock servi est élagué aux paquets hébergés (scripts/prepare-pyodide.mjs) :
 *   `loadPackagesFromImports` ne télécharge que numpy, matplotlib et leurs
 *   dépendances ; tout autre import lève ModuleNotFoundError.
 * - Chaque exécution a son propre espace de noms (`__name__ == "__main__"`) ;
 *   les figures encore ouvertes à la fin sont renvoyées en PNG puis fermées.
 */
import type { PyodideAPI } from 'pyodide';
import type { PythonPhase, PythonRunRequest, PythonWorkerMessage } from './python-protocol';
import {
  appendCapped,
  cleanTraceback,
  PYTHON_FILENAME,
  PYTHON_MAX_FIGURES,
} from './python-output';

const INDEX_URL = new URL('/assets/pyodide/', self.location.origin).href;

/** Neutralise l'avertissement de `plt.show()` sous Agg : la figure est capturée à la fin. */
const SETUP_CODE = `
import warnings
warnings.filterwarnings("ignore", message=".*non-interactive, and thus cannot be shown")
`;

const COLLECT_FIGURES = `
def _oc_collect_figures(limit):
    import sys
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import base64, io, warnings
    import matplotlib.pyplot as plt
    figures = []
    # Avertissements de la sérialisation elle-même : pas ceux de l'élève.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for number in plt.get_fignums()[:limit]:
            buffer = io.BytesIO()
            plt.figure(number).savefig(buffer, format="png", dpi=100, bbox_inches="tight")
            figures.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
    plt.close("all")
    return figures
_oc_collect_figures
`;

let runtime: Promise<{ py: PyodideAPI; collect: (limit: number) => unknown }> | null = null;

async function loadRuntime(): Promise<{ py: PyodideAPI; collect: (limit: number) => unknown }> {
  const url = `${INDEX_URL}pyodide.mjs`;
  const { loadPyodide } = (await import(/* @vite-ignore */ url)) as typeof import('pyodide');
  const py = await loadPyodide({ indexURL: INDEX_URL, env: { MPLBACKEND: 'Agg' } });
  await py.runPythonAsync(SETUP_CODE);
  const collect = (await py.runPythonAsync(COLLECT_FIGURES)) as (limit: number) => unknown;
  return { py, collect };
}

function post(message: PythonWorkerMessage): void {
  self.postMessage(message);
}

function phase(id: number, value: PythonPhase, detail?: string): void {
  post({ id, type: 'phase', phase: value, detail });
}

async function run({ id, code, stdin }: PythonRunRequest): Promise<void> {
  if (runtime === null) {
    phase(id, 'loading-runtime');
  }
  let loaded: Awaited<NonNullable<typeof runtime>>;
  try {
    loaded = await (runtime ??= loadRuntime());
  } catch (e) {
    runtime = null;
    post({ id, type: 'unavailable', detail: e instanceof Error ? e.message : String(e) });
    return;
  }
  const { py, collect } = loaded;

  await py.loadPackagesFromImports(code, {
    messageCallback: (message) => phase(id, 'loading-packages', message),
    errorCallback: () => undefined, // l'import manquant lèvera ModuleNotFoundError
  });

  let stdout = '';
  let stderr = '';
  let truncated = false;
  const append = (target: 'out' | 'err', text: string) => {
    const next = appendCapped(target === 'out' ? stdout : stderr, text);
    truncated ||= next.truncated;
    if (target === 'out') {
      stdout = next.text;
    } else {
      stderr = next.text;
    }
  };
  // Gestionnaire par octets, pas `batched` (par ligne) : l'invite d'`input()`,
  // sans retour à la ligne, doit arriver AVANT l'écho de la saisie.
  const sink = (target: 'out' | 'err') => {
    const decoder = new TextDecoder();
    return {
      write: (buffer: Uint8Array) => {
        append(target, decoder.decode(buffer, { stream: true }));
        return buffer.length;
      },
    };
  };
  py.setStdout(sink('out'));
  py.setStderr(sink('err'));
  const lines = [...stdin];
  py.setStdin({
    stdin: () => {
      const line = lines.shift();
      if (line === undefined) {
        return undefined; // EOF : input() lève EOFError
      }
      append('out', `${line}\n`); // écho, comme au terminal
      return `${line}\n`;
    },
  });

  phase(id, 'running');
  const globals = py.toPy({ __name__: '__main__' });
  let error: string | null = null;
  try {
    await py.runPythonAsync(code, { globals, filename: PYTHON_FILENAME });
  } catch (e) {
    error = cleanTraceback(e instanceof Error ? e.message : String(e));
  } finally {
    globals.destroy();
  }

  let figures: string[] = [];
  try {
    const collected = collect(PYTHON_MAX_FIGURES) as { toJs(): string[]; destroy(): void };
    figures = collected.toJs();
    collected.destroy();
  } catch {
    // Figure impossible à sérialiser : la sortie texte reste utile.
  }
  post({ id, type: 'result', stdout, stderr, error, figures, truncated });
}

addEventListener('message', (event: MessageEvent<PythonRunRequest>) => {
  void run(event.data);
});
