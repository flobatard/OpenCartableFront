/**
 * Prépare les librairies préinstallées du bac à sable des modules, servies
 * sous /assets/module-libs (cf. angular.json) et INLINÉES par le runtime dans
 * le srcdoc des modules qui les déclarent (`// @oc-libs: matter, chart` —
 * cf. src/app/shared/module-runner/module-libraries.ts, dont le catalogue
 * reprend les noms de fichiers produits ici).
 *
 * - Noms stables (`<nom>.js`, `jsxgraph.css`), découplés de l'arborescence des
 *   paquets : une montée de version ne touche que ce script.
 * - Builds UMD/IIFE copiés tels quels ; Three.js n'en publie plus (ESM
 *   seulement) : bundlé ici en IIFE par esbuild, OrbitControls inclus, sous le
 *   global `THREE`.
 * - Garde d'inlining : un `</script` ou un `<!--` dans le texte d'une lib
 *   casserait le `<script>` inline qui la porte. Toute occurrence fait
 *   échouer le script (et donc l'install) plutôt que de livrer un module
 *   cassé en silence.
 * - Licences recopiées à côté (p5 : LGPL-2.1, JSXGraph : LGPL-3/MIT, servis
 *   non modifiés et remplaçables).
 *
 * `.module-libs/` est gitignoré et dockerignoré, régénéré au postinstall.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(projectRoot, 'node_modules');
const out = join(projectRoot, '.module-libs');

/** Fichiers copiés : [sortie, chemin sous node_modules]. */
const COPIED = [
  ['matter.js', 'matter-js/build/matter.min.js'],
  ['chart.js', 'chart.js/dist/chart.umd.min.js'],
  ['p5.js', 'p5/lib/p5.min.js'],
  ['jsxgraph.js', 'jsxgraph/distrib/jsxgraphcore.js'],
  ['jsxgraph.css', 'jsxgraph/distrib/jsxgraph.css'],
  ['d3.js', 'd3/dist/d3.min.js'],
];

const LICENSES = [
  ['matter.LICENSE.txt', 'matter-js/LICENSE'],
  ['chart.LICENSE.txt', 'chart.js/LICENSE.md'],
  ['p5.LICENSE.txt', 'p5/license.txt'],
  ['jsxgraph.LICENSE-LGPL.txt', 'jsxgraph/LICENSE.LGPL'],
  ['jsxgraph.LICENSE-MIT.txt', 'jsxgraph/LICENSE.MIT'],
  ['d3.LICENSE.txt', 'd3/LICENSE'],
  ['three.LICENSE.txt', 'three/LICENSE'],
];

/** Séquences qui casseraient un `<script>`/`<style>` inline. */
const UNSAFE_INLINE = /<\/script|<\/style|<!--/i;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [target, source] of COPIED) {
  // Sans la référence de sourcemap (non copiée : évite un 404 DevTools).
  const text = readFileSync(join(modules, source), 'utf8').replace(
    /\n?\/[/*]# sourceMappingURL=.*$/m,
    '',
  );
  writeFileSync(join(out, target), text);
}

const three = await build({
  stdin: {
    contents: [
      "import * as THREE from 'three';",
      "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';",
      'window.THREE = { ...THREE, OrbitControls };',
    ].join('\n'),
    resolveDir: projectRoot,
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  legalComments: 'none',
  write: false,
  logLevel: 'silent',
});
writeFileSync(join(out, 'three.js'), three.outputFiles[0].text);

for (const [target, source] of LICENSES) {
  copyFileSync(join(modules, source), join(out, target));
}

for (const [target] of [...COPIED, ['three.js']]) {
  if (UNSAFE_INLINE.test(readFileSync(join(out, target), 'utf8'))) {
    throw new Error(
      `prepare-module-libs : ${target} contient « </script », « </style » ou « <!-- » — ` +
        'impossible à inliner dans le srcdoc d’un module.',
    );
  }
}

console.log(`prepare-module-libs : ${COPIED.length + 1} fichier(s) préparé(s) dans .module-libs/`);
