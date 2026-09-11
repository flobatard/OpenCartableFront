/**
 * En-têtes posés par `server.ts` sur certains fichiers statiques (module pur,
 * testé par `static-headers.spec.ts`).
 *
 * - Runtimes WASM (`/assets/sqljs/`, `/assets/pyodide/`) et librairies du bac
 *   à sable des modules (`/assets/module-libs/`) : fichiers NON hashés,
 *   servis sinon avec `maxAge: '1y'` — une montée de version resterait un an
 *   dans le cache des navigateurs. `no-cache` = revalidation par ETag à chaque
 *   chargement (304 bon marché).
 * - Scripts de worker (chunks `worker-<hash>.js` d'Angular, worker de sql.js) :
 *   la CSP d'un worker vient de l'en-tête de SON script, pas du document.
 *   Celle-ci n'autorise que l'origine (scripts, fetch des wasm, wheels et
 *   bases) et la compilation WASM : du code exécuté par un élève (Python, SQL)
 *   ne peut contacter aucune autre origine.
 *
 * `ng serve` ne passe pas par ce serveur : ces en-têtes ne s'observent que
 * sous `npm run serve:ssr:OpenCartableFront` (et en production).
 */

export const WORKER_CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'";

const RUNTIME_DIR = /[\\/]assets[\\/](?:sqljs|pyodide|module-libs)[\\/]/;
const ANGULAR_WORKER = /[\\/]worker-[A-Z0-9]{8}\.m?js$/;
const SQLJS_WORKER = /[\\/]assets[\\/]sqljs[\\/]worker\.sql-wasm\.js$/;

/** En-têtes à ajouter pour un fichier statique (chemin absolu du disque). */
export function staticHeaders(filePath: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (RUNTIME_DIR.test(filePath)) {
    headers['Cache-Control'] = 'no-cache';
  }
  if (ANGULAR_WORKER.test(filePath) || SQLJS_WORKER.test(filePath)) {
    headers['Content-Security-Policy'] = WORKER_CSP;
  }
  return headers;
}
