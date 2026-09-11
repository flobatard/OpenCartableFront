/**
 * Source d'un fence ```sql exécutable (SQLite, via sql.js) :
 *
 *   CREATE TABLE eleve (nom TEXT, classe TEXT);
 *   INSERT INTO eleve VALUES ('Ada', '1G2'), ('Alan', '1G1');
 *   -- @query
 *   SELECT nom FROM eleve WHERE classe = '1G2';
 *
 * Tout ce qui précède la ligne `-- @query` est la PRÉPARATION (repliée, non
 * modifiable) ; ce qui suit est la requête montrée à l'élève, qu'il peut
 * modifier. Le marqueur est un commentaire SQL : le fence reste du SQL
 * valide. Sans marqueur, tout est montré et exécuté.
 */

export interface SqlSource {
  readonly setup: string;
  readonly query: string;
}

const QUERY_MARKER = /^[ \t]*--[ \t]*@query[ \t]*$/im;

export function parseSqlSource(source: string): SqlSource {
  const marker = QUERY_MARKER.exec(source);
  if (marker === null) {
    return { setup: '', query: source.trim() };
  }
  return {
    setup: source.slice(0, marker.index).trim(),
    query: source.slice(marker.index + marker[0].length).trim(),
  };
}
