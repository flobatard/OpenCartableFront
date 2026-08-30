/**
 * Helpers purs de l'export/import de cours (archive .zip via l'API).
 *
 * Le nom du fichier d'export est calculé côté front depuis le titre du cours :
 * le back pose bien un `Content-Disposition`, mais le CORS de l'API ne
 * l'expose pas au JS (`expose_headers` non configuré — assumé, on ne touche
 * pas au contrat CORS pour un nom de fichier).
 */

/** Nom de l'archive d'export : `course-<slug-du-titre>.zip` (accents aplatis). */
export function courseExportFilename(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .toLowerCase();
  return `course-${slug || 'export'}.zip`;
}

/**
 * Déclenche le téléchargement d'un blob — premier usage du motif
 * `URL.createObjectURL` + `<a download>` du projet : l'endpoint d'export exige
 * le Bearer, donc pas de `window.open` possible (contrairement aux downloads
 * de ressources, qui passent par une URL S3 présignée). Browser-only.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
