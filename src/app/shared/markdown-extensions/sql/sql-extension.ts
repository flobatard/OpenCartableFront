import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```sql : requête SQLite exécutable dans le navigateur (sql.js,
 * moteur WASM téléchargé au premier « Exécuter »). Imprimable : le code et la
 * dernière sortie partent dans l'export PDF, les commandes sont masquées.
 * Jamais d'import statique du composant (bundle).
 */
export const SQL_EXTENSION: MarkdownExtensionDef = {
  language: 'sql',
  isPrintable: true,
  loadComponent: () => import('./sql-view').then((m) => m.SqlView),
  doc: { loadComponent: () => import('./sql-doc').then((m) => m.SqlDoc) },
};
