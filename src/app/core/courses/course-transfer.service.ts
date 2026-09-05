import { HttpClient, HttpEventType } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CourseSummary } from './course.model';
import { CourseService } from './course.service';

/** État de l'import d'une archive de cours (un import à la fois, motif `UploadState`). */
export interface ImportState {
  /** `uploading` = corps en cours d'envoi ; `processing` = corps reçu, le back
      parse l'archive et pousse les binaires vers S3 (réponse pas encore là). */
  phase: 'idle' | 'uploading' | 'processing' | 'error';
  /** Progression d'envoi 0-100 (phase `uploading`). */
  progress: number;
}

const IMPORT_IDLE: ImportState = { phase: 'idle', progress: 0 };

/**
 * Export/import d'un cours en archive `.zip` (`GET /v1/courses/{id}/export`,
 * `POST /v1/courses/import`). L'export exige le Bearer (attaché par
 * l'intercepteur, URL sous `apiUrl`) — pas de `window.open` comme pour les
 * URL S3 présignées ; le téléchargement effectif passe par `downloadBlob`
 * (`course-transfer.utils`). L'import est un POST `FormData` multipart : ne
 * JAMAIS poser de `Content-Type` manuel, le navigateur écrit lui-même le
 * boundary. Le cours recréé (nouveaux ids) est inséré en tête de la liste de
 * `CourseService`. État purgé à la déconnexion.
 */
@Injectable({ providedIn: 'root' })
export class CourseTransferService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #courses = inject(CourseService);
  readonly #url = `${environment.apiUrl}/v1/courses`;

  readonly #importState = signal<ImportState>(IMPORT_IDLE);
  /** État de l'import d'archive en cours (consommé par la modale d'import). */
  readonly importState = this.#importState.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#importState.set(IMPORT_IDLE);
      }
    });
  }

  /** Archive `.zip` d'export du cours (manifest + ressources + modules). */
  exportCourse(courseId: string): Promise<Blob> {
    return firstValueFrom(
      this.#http.get(`${this.#url}/${courseId}/export`, { responseType: 'blob' }),
    );
  }

  /**
   * Importe une archive d'export : le back recrée un cours complet (nouveaux
   * ids). `reportProgress` alimente `importState` ; le cours créé est inséré
   * en tête de la liste (tri « modifié récemment » du back).
   */
  async importCourse(file: File): Promise<CourseSummary> {
    const form = new FormData();
    form.append('file', file, file.name);
    this.#importState.set({ phase: 'uploading', progress: 0 });
    try {
      const course = await new Promise<CourseSummary>((resolve, reject) => {
        this.#http
          .post<CourseSummary>(`${this.#url}/import`, form, {
            reportProgress: true,
            observe: 'events',
          })
          .subscribe({
            next: (event) => {
              if (event.type === HttpEventType.UploadProgress && event.total) {
                const progress = Math.round((event.loaded / event.total) * 100);
                this.#importState.set({
                  // Corps entièrement envoyé : le back travaille (parse + S3).
                  phase: progress >= 100 ? 'processing' : 'uploading',
                  progress,
                });
              } else if (event.type === HttpEventType.Response) {
                resolve(event.body as CourseSummary);
              }
            },
            error: reject,
          });
      });
      this.#courses.prependToList(course);
      this.#importState.set(IMPORT_IDLE);
      return course;
    } catch (error) {
      this.#importState.set({ phase: 'error', progress: 0 });
      throw error;
    }
  }
}
