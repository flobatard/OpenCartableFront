/**
 * Collecte du CSS de la page HTML autonome.
 *
 * On sérialise le **CSSOM vivant** (`document.styleSheets`) plutôt qu'une
 * feuille dédiée, et c'est le cœur de la fidélité de l'export : le clone
 * emporte les attributs d'encapsulation d'Angular (`_ngcontent-*`,
 * `_nghost-*`), qui changent à chaque build — seule la CSS du build courant
 * les matche. Toute feuille écrite à la main ici divergerait au premier
 * renommage de classe.
 *
 * Trois réécritures :
 *
 * 1. `@media print` **retiré**. Les règles papier de l'app sont écrites pour
 *    le conteneur d'impression (`body > *:not(#oc-print-root) { display: none }`)
 *    : recopiées telles quelles, elles rendraient la page exportée blanche à
 *    l'impression. Un `@page` minimal les remplace.
 * 2. `@font-face` des polices d'interface **supprimé** : `--font-sans`,
 *    `--font-serif` et `--font-mono` ont déjà des piles de repli système, et
 *    embarquer neuf woff2 coûterait ~200 ko pour un gain typographique.
 * 3. `@font-face` de **KaTeX embarqué en `data:`** — et seulement si le
 *    contenu exporté porte des formules : sans ces polices, les maths sont
 *    illisibles (symboles manquants, pas un simple changement de fonte).
 *    Seule la source woff2 est retenue (~300 ko au total, payés par les seuls
 *    cours qui ont des maths).
 *
 * Les URL relatives des feuilles sont résolues en absolu contre l'URL de la
 * feuille (`ng serve` inline les styles : repli sur `document.baseURI`). Une
 * feuille cross-origin lève à la lecture de `cssRules` : elle est ignorée.
 */

/** Réglage papier minimal de la page exportée (les règles de l'app sont retirées). */
export const EXPORT_PRINT_CSS = '@media print { @page { margin: 14mm } }';

export interface ExportStyleOptions {
  /** Lecture d'un fichier en `data:` URI (`null` si illisible). */
  toDataUrl: (url: string) => Promise<string | null>;
  /** Embarquer les polices KaTeX (vrai seulement si le clone porte des maths). */
  inlineMathFonts: boolean;
}

/** Vrai si le contenu exporté porte au moins une formule rendue par KaTeX. */
export function needsMathFonts(root: HTMLElement): boolean {
  return root.querySelector('.katex') !== null;
}

/** Sérialise les feuilles du document, prêtes à être posées dans un `<style>`. */
export async function collectExportStyles(
  doc: Document,
  options: ExportStyleOptions,
): Promise<string> {
  const blocks: string[] = [];
  for (const sheet of [...doc.styleSheets]) {
    let rules: CSSRule[];
    try {
      rules = [...(sheet.cssRules ?? [])];
    } catch {
      continue; // Feuille cross-origin : illisible, et aucune aujourd'hui.
    }
    const base = sheet.href ?? doc.baseURI;
    for (const rule of rules) {
      const text = await transformRule(rule.cssText, base, options);
      if (text !== null) {
        blocks.push(text);
      }
    }
  }
  blocks.push(EXPORT_PRINT_CSS);
  return blocks.join('\n');
}

/** `null` = règle écartée de l'export. */
async function transformRule(
  cssText: string,
  base: string,
  options: ExportStyleOptions,
): Promise<string | null> {
  if (isPrintOnlyMedia(cssText)) {
    return null;
  }
  if (/^@font-face/i.test(cssText.trim())) {
    return isMathFontFace(cssText) ? inlineMathFontFace(cssText, base, options) : null;
  }
  if (/^@import/i.test(cssText.trim())) {
    return null; // Rien à charger depuis un fichier isolé.
  }
  return absolutizeCssUrls(cssText, base);
}

/** Vrai pour `@media print` (et ses listes dont toutes les requêtes visent le papier). */
function isPrintOnlyMedia(cssText: string): boolean {
  const match = /^@media\s+([^{]+)\{/i.exec(cssText.trim());
  if (match === null) {
    return false;
  }
  return match[1]
    .split(',')
    .every((query) => /^\s*print\s*$/i.test(query));
}

/** Une face KaTeX se reconnaît à sa famille (`KaTeX_Main`, `KaTeX_Math`…). */
function isMathFontFace(cssText: string): boolean {
  return /katex/i.test(cssText);
}

/** Résout les `url(...)` relatives contre l'URL de la feuille. */
function absolutizeCssUrls(cssText: string, base: string): string {
  return cssText.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote: string, url: string) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) {
        return match;
      }
      try {
        return `url(${quote}${new URL(url, base).href}${quote})`;
      } catch {
        return match;
      }
    },
  );
}

/**
 * Remplace la liste de sources d'une face KaTeX par la seule woff2, embarquée
 * en `data:`. Face non embarquable (lecture en échec, pas de woff2) : écartée
 * — mieux vaut un repli système qu'une URL morte dans un fichier hors ligne.
 */
async function inlineMathFontFace(
  cssText: string,
  base: string,
  options: ExportStyleOptions,
): Promise<string | null> {
  if (!options.inlineMathFonts) {
    return null;
  }
  const source = /url\(\s*['"]?([^'")]+\.woff2)['"]?[^)]*\)/i.exec(cssText);
  if (source === null) {
    return null;
  }
  let resolved: string;
  try {
    resolved = new URL(source[1], base).href;
  } catch {
    return null;
  }
  const dataUrl = await options.toDataUrl(resolved);
  if (dataUrl === null) {
    return null;
  }
  return cssText.replace(/src\s*:[^;}]+/i, `src: url(${dataUrl}) format('woff2')`);
}
