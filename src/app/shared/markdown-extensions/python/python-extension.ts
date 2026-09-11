import { MarkdownExtensionDef } from '../markdown-extension.model';

/**
 * Langage ```python : code exécutable dans le navigateur (Pyodide, numpy et
 * matplotlib ; runtime téléchargé au premier « Exécuter »). Imprimable : le
 * code, la sortie et les figures partent dans l'export PDF, les commandes
 * sont masquées. Jamais d'import statique du composant (bundle).
 */
export const PYTHON_EXTENSION: MarkdownExtensionDef = {
  language: 'python',
  isPrintable: true,
  loadComponent: () => import('./python-view').then((m) => m.PythonView),
  doc: { loadComponent: () => import('./python-doc').then((m) => m.PythonDoc) },
};
