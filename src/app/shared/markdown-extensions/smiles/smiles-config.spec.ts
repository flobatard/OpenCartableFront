import { describe, expect, it } from 'vitest';
import { parseSmilesConfig, SMILES_MAX_MOLECULES } from './smiles-config';

describe('parseSmilesConfig', () => {
  it('reads one molecule per line with an optional legend', () => {
    expect(parseSmilesConfig('CCO | Éthanol\nc1ccccc1\n')).toEqual([
      { smiles: 'CCO', legend: 'Éthanol' },
      { smiles: 'c1ccccc1', legend: '' },
    ]);
  });

  it('keeps = and # as SMILES syntax (double and triple bonds)', () => {
    expect(parseSmilesConfig('C=C|Éthène\nC#C | Éthyne')).toEqual([
      { smiles: 'C=C', legend: 'Éthène' },
      { smiles: 'C#C', legend: 'Éthyne' },
    ]);
  });

  it('skips blank lines, comment lines and empty molecules', () => {
    expect(parseSmilesConfig('# Alcools\n\n  | légende seule\nCO | Méthanol')).toEqual([
      { smiles: 'CO', legend: 'Méthanol' },
    ]);
  });

  it('caps the number of molecules', () => {
    const source = Array.from({ length: SMILES_MAX_MOLECULES + 3 }, () => 'C').join('\n');
    expect(parseSmilesConfig(source)).toHaveLength(SMILES_MAX_MOLECULES);
  });
});
