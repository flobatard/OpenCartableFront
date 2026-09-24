/**
 * Pièces jointes des chats de l'assistant — miroir des schémas du back
 * (`app/course_assistant/schemas.py`, `app/course_assistant/attachments.py`).
 *
 * Ce ne sont PAS des ressources du cours : une ressource appartient à la
 * bibliothèque, que le partage public expose en entier aux élèves ; une pièce
 * jointe est un appui de travail privé du professeur.
 */

/** Famille de traitement, décidée par le back d'après le mime. */
export type AttachmentKind = 'image' | 'pdf' | 'text' | 'office';

export type AttachmentStatus = 'pending' | 'available';

/** Une pièce jointe confirmée, telle que la rendent le back et le fil. */
export interface Attachment {
  id: string;
  original_name: string;
  mime: string;
  kind: AttachmentKind;
  size: number;
  status: AttachmentStatus;
  created_at: string;
}

export interface AttachmentCreatePayload {
  original_name: string;
  mime: string;
  size: number;
}

export interface AttachmentPresign {
  attachment_id: string;
  upload_url: string;
  status: AttachmentStatus;
  expires_in: number;
}

export interface AttachmentDownload {
  download_url: string;
  expires_in: number;
}

/**
 * Whitelist FERMÉE, miroir d'`ATTACHMENT_TYPES` du back : mime → famille.
 * Le back refuse en 422 tout mime absent — le front filtre en amont pour
 * donner un message utile plutôt qu'une erreur réseau.
 */
export const ATTACHMENT_KINDS: Readonly<Record<string, AttachmentKind>> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'office',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'office',
  'application/vnd.oasis.opendocument.text': 'office',
  'application/vnd.oasis.opendocument.presentation': 'office',
};

/** Plafonds PAR FAMILLE, miroir d'`ATTACHMENT_MAX_BYTES` du back. */
export const ATTACHMENT_MAX_BYTES: Readonly<Record<AttachmentKind, number>> = {
  image: 3_500_000,
  pdf: 20 * 1024 * 1024,
  text: 1_000_000,
  office: 15 * 1024 * 1024,
};

/** Miroir de `MAX_ATTACHMENTS_PER_MESSAGE` (422 au-delà). */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/**
 * Extension → mime, pour les formats que le navigateur type mal. `File.type`
 * d'un `.md` vaut très souvent `''` ou `text/plain` selon l'OS, et le
 * `Content-Type` du PUT est FIGÉ dans la signature du presign : se tromper ici
 * fait échouer l'upload sur S3, pas sur l'API.
 */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Mime à déclarer au presign pour ce fichier : celui du navigateur s'il est
 * dans la whitelist, sinon celui déduit de l'extension, sinon `null` (format
 * refusé). L'extension prime quand le navigateur dit `text/plain` pour un
 * `.md` ou un `.csv` — deux formats que le back distingue.
 */
export function attachmentMimeOf(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const byExtension = MIME_BY_EXTENSION[extension];
  const declared = file.type;
  if (byExtension && (!declared || declared === 'text/plain' || !(declared in ATTACHMENT_KINDS))) {
    return byExtension;
  }
  return declared in ATTACHMENT_KINDS ? declared : null;
}

/** Famille d'un mime accepté, ou `null` hors whitelist. */
export function attachmentKindOf(mime: string): AttachmentKind | null {
  return ATTACHMENT_KINDS[mime] ?? null;
}

/** Valeur de l'attribut `accept` du sélecteur de fichiers. */
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_KINDS).join(',');
