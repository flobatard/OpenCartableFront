import { describe, expect, it } from 'vitest';
import { parseSqlSource } from './sql-config';

describe('parseSqlSource', () => {
  it('splits the setup from the query at the -- @query marker', () => {
    const source =
      "CREATE TABLE eleve (nom TEXT);\nINSERT INTO eleve VALUES ('Ada');\n-- @query\nSELECT nom FROM eleve;\n";
    expect(parseSqlSource(source)).toEqual({
      setup: "CREATE TABLE eleve (nom TEXT);\nINSERT INTO eleve VALUES ('Ada');",
      query: 'SELECT nom FROM eleve;',
    });
  });

  it('accepts spacing and case variations of the marker', () => {
    expect(parseSqlSource('SELECT 1;\n  --   @QUERY  \nSELECT 2;')).toEqual({
      setup: 'SELECT 1;',
      query: 'SELECT 2;',
    });
  });

  it('without marker, everything is the query', () => {
    expect(parseSqlSource('\nSELECT 1 + 1;\n')).toEqual({ setup: '', query: 'SELECT 1 + 1;' });
  });

  it('an ordinary comment is not a marker', () => {
    expect(parseSqlSource('-- @query est le marqueur\nSELECT 1;').setup).toBe('');
  });
});
