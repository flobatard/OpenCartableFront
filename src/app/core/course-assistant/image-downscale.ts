/**
 * Réduction d'une image avant son envoi en pièce jointe.
 *
 * Pourquoi côté navigateur : le back lit les images SANS redimensionnement
 * (décision 13 — pas de traitement d'image sur le Pi), et les refuse au-delà
 * de `ATTACHMENT_MAX_BYTES.image`. Une photo de tableau prise au téléphone
 * pèse couramment 5 à 10 Mo : sans cette réduction, le professeur se heurte à
 * un refus sans comprendre. C'est la piste inscrite dans TODO.md.
 *
 * Client-only (`createImageBitmap`, canvas) : les chats vivent dans des pages
 * `RenderMode.Client`.
 */

/** Plus grand côté toléré après réduction — large pour un texte au tableau. */
const MAX_EDGE = 2000;
/** Qualités tentées dans l'ordre, jusqu'à passer sous le plafond. */
const QUALITIES = [0.9, 0.75, 0.6];

/**
 * Renvoie le fichier tel quel s'il tient déjà dans le plafond, sinon une
 * version réduite.
 *
 * **Ne jamais ré-encoder une image déjà petite** : une capture d'écran PNG de
 * 200 ko ressort souvent plus lourde après un aller-retour canvas.
 *
 * Le mime de sortie est lu sur le blob produit (`blob.type`), **jamais
 * supposé** : `toBlob` retombe silencieusement sur PNG quand le navigateur
 * n'encode pas le WebP — même piège que la modale de recadrage d'avatar. PNG
 * étant dans la whitelist, le repli est sûr.
 *
 * En cas d'échec (format illisible, canvas indisponible), le fichier d'origine
 * est renvoyé : c'est alors le back qui tranchera.
 */
export async function downscaleImage(file: File, maxBytes: number): Promise<File> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    if (file.size <= maxBytes && longestEdge <= MAX_EDGE) {
      return file;
    }
    const ratio = Math.min(1, MAX_EDGE / longestEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) {
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= maxBytes) {
        return new File([blob], renameTo(file.name, blob.type), { type: blob.type });
      }
    }
    return file;
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

/** Aligne l'extension sur le format réellement produit. */
function renameTo(name: string, mime: string): string {
  const extension = mime === 'image/webp' ? 'webp' : 'png';
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.${extension}`;
}
