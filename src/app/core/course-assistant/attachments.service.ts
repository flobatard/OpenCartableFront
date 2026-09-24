import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Attachment,
  AttachmentCreatePayload,
  AttachmentDownload,
  AttachmentPresign,
} from './attachment.model';

/**
 * Upload des pièces jointes d'un chat de l'assistant — même flow en trois
 * temps que `ResourceService` (Descriptions.md §5.2) : POST presign (API,
 * Bearer automatique), **PUT direct navigateur→S3** sur l'URL présignée —
 * hors `environment.apiUrl`, donc sans Bearer, c'est voulu ; le
 * `Content-Type` doit être STRICTEMENT le mime déclaré au presign, figé dans
 * la signature —, puis POST confirm (API).
 *
 * Sans état : les brouillons du composer vivent dans `AssistantChatState`.
 * La route de presign ne porte **aucun id de conversation** : on peut joindre
 * un fichier alors que la conversation est encore un brouillon sans id.
 */
@Injectable({ providedIn: 'root' })
export class AssistantAttachmentsService {
  readonly #http = inject(HttpClient);

  #base(courseId: string): string {
    return `${environment.apiUrl}/v1/courses/${courseId}/assistant/attachments`;
  }

  /**
   * Upload complet : presign → PUT S3 → confirm. `onProgress` reçoit 0–100
   * pendant l'envoi (le composer affiche une barre par pièce jointe).
   */
  async upload(
    courseId: string,
    file: File,
    mime: string,
    onProgress?: (percent: number) => void,
  ): Promise<Attachment> {
    const payload: AttachmentCreatePayload = {
      original_name: file.name,
      mime,
      size: file.size,
    };
    const presign = await firstValueFrom(
      this.#http.post<AttachmentPresign>(this.#base(courseId), payload),
    );
    await this.#putToS3(presign.upload_url, file, mime, onProgress);
    return firstValueFrom(
      this.#http.post<Attachment>(
        `${this.#base(courseId)}/${presign.attachment_id}/confirm`,
        null,
      ),
    );
  }

  /**
   * Retire une pièce jointe pas encore envoyée. Le back répond 409 pour une
   * pièce déjà rattachée à un message : elle fait partie de la conversation.
   */
  remove(courseId: string, attachmentId: string): Promise<void> {
    return firstValueFrom(
      this.#http.delete<void>(`${this.#base(courseId)}/${attachmentId}`),
    );
  }

  /** URL présignée de lecture (TTL court) — l'ouverture reste à l'appelant. */
  async downloadUrl(courseId: string, attachmentId: string): Promise<string> {
    const download = await firstValueFrom(
      this.#http.get<AttachmentDownload>(
        `${this.#base(courseId)}/${attachmentId}/download`,
      ),
    );
    return download.download_url;
  }

  /** PUT du binaire sur l'URL présignée, progression relayée à l'appelant. */
  #putToS3(
    uploadUrl: string,
    file: File,
    mime: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#http
        .put(uploadUrl, file, {
          headers: new HttpHeaders({ 'Content-Type': mime }),
          reportProgress: true,
          observe: 'events',
          responseType: 'text',
        })
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress && event.total) {
              onProgress?.(Math.round((event.loaded / event.total) * 100));
            }
          },
          error: reject,
          complete: () => resolve(),
        });
    });
  }
}
