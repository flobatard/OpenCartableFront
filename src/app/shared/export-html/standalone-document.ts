/**
 * Assemblage du fichier HTML autonome : un seul document, ouvrable en
 * `file://`, sans réseau. Helpers PURS (testés en jsdom).
 *
 * Le corps est l'`outerHTML` du clone déjà transformé (donc déjà sanitisé par
 * `core/markdown/`, comme à l'impression) ; les styles viennent du CSSOM
 * vivant (`export-styles.ts`). Le seul script embarqué est le pendant minimal
 * du pont des modules : sans lui, les iframes resteraient à leur hauteur par
 * défaut.
 */

/** Attribut posé sur les iframes de module de l'export (cible du script de resize). */
export const EXPORT_MODULE_FRAME_ATTR = 'data-oc-module-frame';

/**
 * Mise en page de la page exportée : l'app pose sa gouttière dans `.app-main`,
 * absent du fichier. Le reste (fond, couleurs, typographie) vient des règles
 * `body` de l'app, recopiées avec le CSSOM.
 */
const EXPORT_LAYOUT_CSS =
  `.oc-export { box-sizing: border-box; margin: 0 auto; max-width: 1100px; padding: 24px 16px; }` +
  `.oc-export__title { margin: 0 0 24px; font-family: var(--font-display); font-size: 28px; }`;

/**
 * Pendant minimal, côté page exportée, du pont de `module-document.ts` :
 * le module poste `{source:'oc-module', type:'oc-module:resize'}` à son parent
 * et ce parent n'est plus `ModuleRunner` mais ce fichier. Mêmes bornes que
 * `clampFrameHeight` — les garder en phase.
 *
 * La provenance est vérifiée par identité de `contentWindow` (la garantie
 * forte ; l'origine d'un `srcdoc` sandboxé vaut `'null'`, comme celle d'un
 * document ouvert en `file://` — elle ne distinguerait rien ici).
 */
const RESIZE_SCRIPT = `(function () {
  'use strict';
  var MIN = 80, MAX = 4000;
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== 'oc-module' || data.type !== 'oc-module:resize') {
      return;
    }
    var height = data.payload && data.payload.height;
    if (typeof height !== 'number' || !isFinite(height)) {
      return;
    }
    var frames = document.querySelectorAll('iframe[${EXPORT_MODULE_FRAME_ATTR}]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        frames[i].style.height = Math.min(MAX, Math.max(MIN, Math.round(height))) + 'px';
      }
    }
  });
})();`;

export interface StandaloneDocumentInput {
  /** Titre de la page (titre du cours ou du bloc). */
  title: string;
  /** Langue de l'interface au moment de l'export (`lang` du document). */
  lang: string;
  /** CSS collecté par `collectExportStyles`. */
  styles: string;
  /** `outerHTML` du clone transformé. */
  body: string;
  /**
   * Titre affiché en tête du document. Posé pour un cours entier — l'en-tête
   * de la page élève vit dans la coquille, hors du clone — et omis pour un
   * bloc seul, dont le titre est déjà dans le contenu.
   */
  heading?: string;
}

/**
 * Sérialise la page complète. Le thème est figé en **clair** : le fichier n'a
 * pas le script de thème d'`index.html`, et le clair est le rendu de référence
 * (comme au PDF).
 */
export function buildStandaloneDocument(input: StandaloneDocumentInput): string {
  return [
    '<!doctype html>',
    `<html lang="${escapeAttribute(input.lang)}" data-theme="light">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(input.title)}</title>`,
    `<style>${safeStyle(input.styles)}</style>`,
    `<style>${EXPORT_LAYOUT_CSS}</style>`,
    '</head>',
    '<body>',
    `<div class="oc-export">${heading(input.heading)}${input.body}</div>`,
    `<script>${RESIZE_SCRIPT}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

/** Titre de tête, échappé ; rien si l'appelant n'en donne pas. */
function heading(title: string | undefined): string {
  const text = title?.trim() ?? '';
  return text === '' ? '' : `<h1 class="oc-export__title">${escapeText(text)}</h1>`;
}

/** Neutralise un `</style` qui casserait la composition (cf. `module-document.ts`). */
function safeStyle(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
