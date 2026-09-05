/**
 * Composition et protocole postMessage des modules interactifs — helpers PURS
 * (testés en jsdom), partagés par `ModuleRunner` et ses specs.
 *
 * Sécurité (Descriptions.md §5.5) : le document composé est exécuté dans une
 * `<iframe sandbox="allow-scripts allow-forms allow-modals">` SANS
 * `allow-same-origin` — origine opaque (`'null'`) : le JS du prof n'a accès
 * ni aux cookies, ni au localStorage (lève une exception), ni au DOM/tokens
 * de l'app. Le réseau sortant est **bloqué par CSP** (`MODULE_CSP`,
 * cf. docs/decisions.md) : un module est
 * self-contained, ses assets passent en `data:`/`blob:`. Seul un pont
 * postMessage contrôlé relie le module à la page.
 */

/** Marqueur `source` des messages du pont (filtre côté parent). */
export const MODULE_MESSAGE_SOURCE = 'oc-module';

/** Bornes de l'auto-resize de l'iframe (px) — un module ne peut pas écraser la page. */
export const MODULE_FRAME_MIN_HEIGHT = 80;
export const MODULE_FRAME_MAX_HEIGHT = 4000;
/** Hauteur avant le premier message resize du bridge. */
export const MODULE_FRAME_DEFAULT_HEIGHT = 240;

/** Message normalisé du pont, côté parent. */
export type ModuleMessage =
  | { type: 'resize'; height: number }
  | { type: 'event'; name: string; data: unknown };

/** Événement applicatif émis par un module via `ocModule.emit(name, data)`. */
export interface ModuleEventPayload {
  name: string;
  data: unknown;
}

/**
 * Bridge injecté AVANT le JS du prof : auto-resize (ResizeObserver sur
 * `documentElement`) + API `window.ocModule.emit(name, data)`. Le
 * `targetOrigin: '*'` est obligatoire (l'iframe opaque ne connaît pas
 * l'origine du parent) et sans risque : le payload ne porte aucun secret.
 */
const MODULE_BRIDGE = `(function () {
  'use strict';
  var send = function (type, payload) {
    parent.postMessage({ source: '${MODULE_MESSAGE_SOURCE}', type: type, payload: payload }, '*');
  };
  var report = function () {
    send('oc-module:resize', { height: document.documentElement.scrollHeight });
  };
  new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener('load', report);
  window.ocModule = {
    emit: function (name, data) {
      send('oc-module:event', { name: String(name), data: data });
    }
  };
})();`;

/**
 * CSP du document composé : **aucun réseau sortant**. `default-src 'none'`
 * coupe tous les canaux silencieux (fetch/XHR/WebSocket/beacon, scripts,
 * feuilles de style, images, fonts et iframes externes, workers) ; seuls
 * restent le code inline du module et les assets embarqués `data:`/`blob:`
 * (canvas, `URL.createObjectURL`). `form-action 'none'` (non couvert par
 * default-src) ferme l'exfiltration par soumission de formulaire — les
 * formulaires gérés en JS (preventDefault) continuent de marcher.
 *
 * `'unsafe-eval'` est autorisé (cf. docs/decisions.md) : les modules pédagogiques
 * évaluent des expressions saisies (`new Function`/`eval` — ex. grapheur de
 * `f(x)`). Dans CE contexte, eval n'accorde aucune capacité nouvelle (tout
 * le JS du module est déjà du code arbitraire du prof) et ne rouvre ni le
 * réseau ni le sandbox ; le résidu est un self-XSS confiné : un élève qui
 * injecte du code via une saisie évaluée n'atteint que l'iframe opaque —
 * sans données, sans réseau, sans session. Corollaire de contrat : les
 * événements du bridge (`ocModule.emit`) restent NON FIABLES côté app.
 *
 * Un second `<meta>` CSP écrit par le prof ne peut que restreindre davantage
 * (les politiques s'intersectent), jamais rouvrir. Résidu assumé : la
 * navigation du document lui-même par clic sur un lien (non couvrable en
 * meta CSP), visible à l'écran et confinée par le sandbox (ni popup ni
 * top-navigation). Caveat déploiement : une iframe `srcdoc` HÉRITE aussi de
 * la CSP de la page hôte — si l'infra (nginx) pose un jour une CSP d'en-tête
 * sur l'app, elle devra tolérer `'unsafe-eval'` ou les modules casseront.
 */
export const MODULE_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; media-src data: blob:; font-src data:; " +
  "form-action 'none'; base-uri 'none'";

/**
 * Compose le document `srcdoc` d'un module : CSP puis CSS en tête, HTML dans
 * le body, puis le bridge et enfin le JS du prof. Le JS est neutralisé contre
 * un `</script>` littéral qui casserait la composition (`<\/script` — dans
 * une chaîne JS, `\/` ≡ `/`, transformation sémantiquement neutre) ; le CSS
 * l'est contre `</style`.
 */
export function composeModuleDocument(html: string, css: string, js: string): string {
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${MODULE_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${safeCss}</style>`,
    '</head>',
    '<body>',
    html,
    `<script>${MODULE_BRIDGE}</script>`,
    `<script>${safeJs}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

/** Borne une hauteur remontée par le bridge dans les limites d'affichage. */
export function clampFrameHeight(height: number): number {
  return Math.min(MODULE_FRAME_MAX_HEIGHT, Math.max(MODULE_FRAME_MIN_HEIGHT, Math.round(height)));
}

/**
 * Valide et normalise un `event.data` reçu du pont ; `null` pour tout
 * message étranger ou malformé (la validation de la PROVENANCE —
 * `event.source`/`event.origin` — reste au composant, seul à connaître
 * l'iframe).
 */
export function parseModuleMessage(data: unknown): ModuleMessage | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const message = data as Record<string, unknown>;
  if (message['source'] !== MODULE_MESSAGE_SOURCE) {
    return null;
  }
  const payload = message['payload'];
  if (message['type'] === 'oc-module:resize') {
    const height =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)['height']
        : null;
    if (typeof height !== 'number' || !Number.isFinite(height)) {
      return null;
    }
    return { type: 'resize', height };
  }
  if (message['type'] === 'oc-module:event') {
    const name =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)['name']
        : null;
    if (typeof name !== 'string' || !name) {
      return null;
    }
    return { type: 'event', name, data: (payload as Record<string, unknown>)['data'] };
  }
  return null;
}
