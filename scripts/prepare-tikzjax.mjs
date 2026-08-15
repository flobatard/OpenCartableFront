/**
 * Prépare les assets TikZJax servis sous /assets/tikzjax (cf. angular.json).
 *
 * Pourquoi ne pas copier node_modules/@drgrice1/tikzjax/dist tel quel : le
 * middleware statique du dev server Angular/Vite (sirv) pose
 * `Content-Encoding: gzip` sur tout fichier `*.gz`. Le navigateur décompresse
 * alors le corps de façon transparente, et pako — embarqué dans le worker
 * run-tex.js, qui décompresse lui-même ses fichiers — reçoit des données déjà
 * décompressées : `Error: -3` (Z_DATA_ERROR) et aucune figure ne compile en
 * dev (la prod servie par Express/nginx ne pose pas cet en-tête, d'où un bug
 * dev uniquement, mais on veut des artefacts identiques dans les deux modes).
 *
 * Correctif : recopier dist/ dans .tikzjax/ (gitignoré, régénéré au
 * postinstall) en renommant chaque `*.gz` en `*.gzb` (extension inconnue des
 * tables MIME → servie en octet-stream, sans Content-Encoding, partout) et en
 * réécrivant les TROIS références de fichiers codées en dur dans run-tex.js :
 * `tex.wasm.gz`, `core.dump.gz` et le gabarit `tex_files/${x}.gz`. Les autres
 * occurrences de « .gz » du fichier sont des propriétés internes de pako
 * (`e.gz`, `this.gz`…) et ne doivent PAS être touchées. Chaque remplacement
 * est vérifié : une mise à jour du paquet qui changerait ces chemins fait
 * échouer le script (et donc l'install) plutôt que de casser en silence.
 */
import {
  cpSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(projectRoot, 'node_modules', '@drgrice1', 'tikzjax', 'dist');
const out = join(projectRoot, '.tikzjax');

rmSync(out, { recursive: true, force: true });
cpSync(src, out, {
  recursive: true,
  filter: (path) => !path.endsWith('.map'),
});

function renameGzFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      renameGzFiles(path);
    } else if (entry.name.endsWith('.gz')) {
      renameSync(path, `${path}b`);
    }
  }
}
renameGzFiles(out);

const runTexPath = join(out, 'run-tex.js');
let runTex = readFileSync(runTexPath, 'utf8');
const replacements = [
  ['tex.wasm.gz', 'tex.wasm.gzb'],
  ['core.dump.gz', 'core.dump.gzb'],
];
for (const [from, to] of replacements) {
  if (!runTex.includes(from)) {
    throw new Error(`prepare-tikzjax : référence « ${from} » introuvable dans run-tex.js — le paquet a changé, adapter ce script.`);
  }
  runTex = runTex.replaceAll(from, to);
}
const texFilesPattern = /tex_files\/\$\{([A-Za-z_$][\w$]*)\}\.gz(?!b)/g;
if (!texFilesPattern.test(runTex)) {
  throw new Error('prepare-tikzjax : gabarit « tex_files/${…}.gz » introuvable dans run-tex.js — le paquet a changé, adapter ce script.');
}
runTex = runTex.replace(texFilesPattern, 'tex_files/${$1}.gzb');
// La sourcemap n'est pas copiée : retire sa référence pour éviter un 404 DevTools.
runTex = runTex.replace(/\n?\/\/# sourceMappingURL=.*$/m, '');
writeFileSync(runTexPath, runTex);

const tikzjax = readFileSync(join(out, 'tikzjax.js'), 'utf8');
if (/\.gz["'`]/.test(tikzjax)) {
  throw new Error('prepare-tikzjax : tikzjax.js référence désormais des fichiers .gz — adapter ce script.');
}
writeFileSync(join(out, 'tikzjax.js'), tikzjax.replace(/\n?\/\/# sourceMappingURL=.*$/m, ''));

console.log('prepare-tikzjax : assets préparés dans .tikzjax/');
