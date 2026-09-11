import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';

/**
 * Page de documentation du langage ```sql — montée par DocsShell (slug `sql`,
 * cf. SQL_EXTENSION.doc). Prose via i18n `docs.sql.*`.
 */
@Component({
  selector: 'app-sql-doc',
  imports: [MarkdownPlayground, TranslocoPipe],
  templateUrl: './sql-doc.html',
})
export class SqlDoc {
  protected readonly firstExample = "```sql\nSELECT 6 * 7 AS reponse, upper('sqlite') AS moteur;\n```";

  protected readonly setupExample = `\`\`\`sql
CREATE TABLE eleve (nom TEXT, classe TEXT, moyenne REAL);
INSERT INTO eleve VALUES
  ('Ada', '1G2', 15.5), ('Alan', '1G1', 12.0),
  ('Grace', '1G2', 17.25), ('Linus', '1G1', 9.5);
-- @query
SELECT nom, moyenne FROM eleve WHERE classe = '1G2' ORDER BY moyenne DESC;
\`\`\``;

  protected readonly joinExample = `\`\`\`sql
CREATE TABLE ville (id INTEGER PRIMARY KEY, nom TEXT, pays TEXT);
CREATE TABLE monument (nom TEXT, ville_id INTEGER REFERENCES ville (id));
INSERT INTO ville VALUES (1, 'Paris', 'France'), (2, 'Rome', 'Italie'), (3, 'Lyon', 'France');
INSERT INTO monument VALUES
  ('Tour Eiffel', 1), ('Louvre', 1), ('Colisée', 2), ('Fourvière', 3);
-- @query
SELECT v.pays, COUNT(*) AS monuments
FROM monument AS m JOIN ville AS v ON v.id = m.ville_id
GROUP BY v.pays
ORDER BY monuments DESC;
\`\`\``;

  protected readonly errorExample = '```sql\nSELECT * FROM table_inconnue;\n```';
}
