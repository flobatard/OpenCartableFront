/**
 * Configuration d'un fence ```smiles : une molécule par ligne, en notation
 * SMILES, suivie d'une légende optionnelle après une barre verticale.
 *
 *   CCO | Éthanol
 *   CC(=O)O | Acide éthanoïque
 *   c1ccccc1
 *
 * Parser dédié, PAS `parseExtensionConfig` : `=` (double liaison) et `#`
 * (triple liaison) sont de la syntaxe SMILES. Seule une ligne qui COMMENCE par
 * `#` est un commentaire — un SMILES ne commence jamais ainsi.
 */

export interface SmilesMolecule {
  readonly smiles: string;
  readonly legend: string;
}

/** Au-delà, la mise en page de SmilesDrawer devient coûteuse pour rien. */
export const SMILES_MAX_LENGTH = 400;
/** Nombre de molécules dessinées au plus par fence. */
export const SMILES_MAX_MOLECULES = 12;

/** Parse la source du fence ; lignes vides et commentaires ignorés. */
export function parseSmilesConfig(source: string): SmilesMolecule[] {
  const molecules: SmilesMolecule[] = [];
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const bar = line.indexOf('|');
    const smiles = (bar < 0 ? line : line.slice(0, bar)).trim();
    const legend = bar < 0 ? '' : line.slice(bar + 1).trim();
    if (smiles !== '') {
      molecules.push({ smiles, legend });
    }
  }
  return molecules.slice(0, SMILES_MAX_MOLECULES);
}
