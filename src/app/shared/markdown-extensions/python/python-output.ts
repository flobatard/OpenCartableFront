/**
 * Mise en forme pure de la sortie d'une exécution Python (partagée par le
 * worker et testée à part).
 */

/** Nom de fichier du code de l'élève : les tracebacks citent alors ses lignes. */
export const PYTHON_FILENAME = 'main.py';
/** Caractères de sortie gardés (stdout et stderr confondus, par flux). */
export const PYTHON_MAX_OUTPUT = 10_000;
/** Figures matplotlib renvoyées au plus. */
export const PYTHON_MAX_FIGURES = 10;

/**
 * Traceback réduit au code de l'élève : les cadres internes de Pyodide
 * (`_pyodide/_base.py`, `eval_code_async`…) qui précèdent le premier cadre de
 * `main.py` sont retirés. Sans cadre `main.py` (erreur de syntaxe, levée
 * interne), le message est rendu tel quel.
 */
export function cleanTraceback(message: string): string {
  const lines = message.trimEnd().split('\n');
  const header = lines.findIndex((line) => line.startsWith('Traceback'));
  const firstUserFrame = lines.findIndex((line) =>
    line.trimStart().startsWith(`File "${PYTHON_FILENAME}"`),
  );
  if (header < 0 || firstUserFrame < 0) {
    return lines.join('\n');
  }
  return [lines[header], ...lines.slice(firstUserFrame)].join('\n');
}

/** Ajoute `chunk` à `buffer` sans dépasser `max` ; `truncated` si coupé. */
export function appendCapped(
  buffer: string,
  chunk: string,
  max: number = PYTHON_MAX_OUTPUT,
): { readonly text: string; readonly truncated: boolean } {
  if (buffer.length + chunk.length <= max) {
    return { text: buffer + chunk, truncated: false };
  }
  return { text: (buffer + chunk).slice(0, max), truncated: true };
}
