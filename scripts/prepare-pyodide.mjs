/**
 * Prépare le runtime Pyodide servi sous /assets/pyodide (cf. angular.json),
 * dans .pyodide/ (gitignoré ET dockerignoré : sinon le `COPY . .` du
 * Dockerfile écraserait le téléchargement fait par le `npm ci` du build).
 *
 * - Cœur : copié depuis node_modules/pyodide (même version que le paquet npm).
 * - Paquets : le paquet npm ne contient AUCUNE wheel. On calcule, dans
 *   pyodide-lock.json, la fermeture des dépendances de PACKAGES, on télécharge
 *   chaque wheel depuis la distribution officielle de LA MÊME version et on
 *   vérifie son sha256 contre le lock ; un fichier déjà présent au bon hash
 *   n'est pas retéléchargé. Hash faux ou fichier absent du CDN : l'install
 *   échoue (jamais de runtime livré à moitié en silence).
 * - Lock élagué : seuls les paquets réellement hébergés y figurent. Un
 *   `import pandas` lève alors un ModuleNotFoundError propre au lieu d'une
 *   requête 404 vers un fichier absent.
 *
 * OC_SKIP_PYODIDE_PACKAGES=1 saute le téléchargement (install hors ligne) :
 * Python reste utilisable, sans numpy ni matplotlib.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Paquets proposés aux cours (leurs dépendances suivent). */
const PACKAGES = ['numpy', 'matplotlib'];
const CORE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip'];

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(projectRoot, 'node_modules', 'pyodide');
const out = join(projectRoot, '.pyodide');
const skipPackages = process.env.OC_SKIP_PYODIDE_PACKAGES === '1';

const { version } = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
const cdn = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
const lock = JSON.parse(readFileSync(join(src, 'pyodide-lock.json'), 'utf8'));

mkdirSync(out, { recursive: true });
for (const file of CORE_FILES) {
  copyFileSync(join(src, file), join(out, file));
}
// La sourcemap n'est pas copiée : retire sa référence pour éviter un 404 DevTools.
const loaderPath = join(out, 'pyodide.mjs');
writeFileSync(loaderPath, readFileSync(loaderPath, 'utf8').replace(/\n?\/\/# sourceMappingURL=.*$/m, ''));

/** Fermeture des dépendances des paquets demandés, d'après le lock. */
function closure(names) {
  const seen = new Set();
  const stack = [...names];
  while (stack.length > 0) {
    const name = stack.pop();
    if (seen.has(name)) {
      continue;
    }
    const entry = lock.packages[name];
    if (entry === undefined) {
      throw new Error(`prepare-pyodide : paquet « ${name} » absent de pyodide-lock.json ${version}.`);
    }
    seen.add(name);
    stack.push(...(entry.depends ?? []));
  }
  return [...seen].sort();
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const wanted = closure(PACKAGES);
const hosted = [];
for (const name of wanted) {
  const { file_name: fileName, sha256: expected } = lock.packages[name];
  const target = join(out, fileName);
  if (existsSync(target) && sha256(readFileSync(target)) === expected) {
    hosted.push(name);
    continue;
  }
  if (skipPackages) {
    continue;
  }
  const response = await fetch(cdn + fileName);
  if (!response.ok) {
    throw new Error(`prepare-pyodide : ${cdn + fileName} → HTTP ${response.status}.`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (sha256(body) !== expected) {
    throw new Error(`prepare-pyodide : empreinte sha256 inattendue pour ${fileName} — fichier refusé.`);
  }
  writeFileSync(target, body);
  hosted.push(name);
}

// Wheels d'une version précédente : retirées (elles ne figurent plus au lock).
const hostedFiles = new Set(hosted.map((name) => lock.packages[name].file_name));
for (const file of readdirSync(out)) {
  if (file.endsWith('.whl') && !hostedFiles.has(file)) {
    rmSync(join(out, file));
  }
}

const packages = Object.fromEntries(hosted.map((name) => [name, lock.packages[name]]));
writeFileSync(join(out, 'pyodide-lock.json'), JSON.stringify({ info: lock.info, packages }));

const missing = wanted.filter((name) => !hosted.includes(name));
console.log(
  `prepare-pyodide : Pyodide ${version} préparé dans .pyodide/ — ${hosted.length} paquet(s) hébergé(s)` +
    (missing.length > 0 ? `, ${missing.length} sauté(s) (OC_SKIP_PYODIDE_PACKAGES)` : ''),
);
