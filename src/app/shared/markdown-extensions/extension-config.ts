/**
 * Parseur générique de la configuration des fences d'extension : une ligne =
 * `clé=valeur`, valeur optionnellement entre guillemets (`"…"` ou `'…'`),
 * lignes vides et commentaires `#` ignorés. Les doublons sont préservés en
 * ordre (ex. plusieurs `point=` pour JSXGraph). Module pur, sans Angular —
 * chaque langage dérive sa config typée de ces entrées (cf. geogebra-config).
 */

/** Une ligne `clé=valeur` du fence. */
export interface ExtensionConfigEntry {
  readonly key: string;
  readonly value: string;
}

/** Parse la source d'un fence en entrées ordonnées ; lignes invalides ignorées. */
export function parseExtensionConfig(source: string): ExtensionConfigEntry[] {
  const entries: ExtensionConfigEntry[] = [];
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (key === '') {
      continue;
    }
    entries.push({ key, value: unquote(line.slice(eq + 1).trim()) });
  }
  return entries;
}

/** Première valeur d'une clé, ou `null` si absente. */
export function configValue(
  entries: readonly ExtensionConfigEntry[],
  key: string,
): string | null {
  return entries.find((e) => e.key === key)?.value ?? null;
}

/** Toutes les valeurs d'une clé, en ordre d'apparition. */
export function configValues(entries: readonly ExtensionConfigEntry[], key: string): string[] {
  return entries.filter((e) => e.key === key).map((e) => e.value);
}

/** Retire une paire de guillemets englobante (`"…"` ou `'…'`), sinon tel quel. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first)) {
      return value.slice(1, -1);
    }
  }
  return value;
}
