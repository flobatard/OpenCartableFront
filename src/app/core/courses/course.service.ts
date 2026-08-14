import { HttpClient, HttpEventType } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  BlockMetaPayload,
  BlockType,
  CourseBlock,
  CourseCreatePayload,
  CourseDetail,
  CourseSummary,
  CourseVisibility,
} from './course.model';

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
 * Cours du prof courant — variante MUTABLE du patron `SubjectService` (comme
 * `UserProfileService`) : signaux source de vérité, refetch à chaque entrée
 * de page (les données changent au fil des mutations, pas de `shareReplay`
 * figé), mutations de blocs qui mettent à jour le signal `detail` localement
 * à partir de la réponse du back. Tout est purgé quand la session OIDC tombe.
 *
 * Le Bearer est attaché automatiquement par l'intercepteur OIDC (URL sous
 * `environment.apiUrl`) ; le service n'est sollicité que depuis des pages
 * protégées (`RenderMode.Client`), côté navigateur.
 */
@Injectable({ providedIn: 'root' })
export class CourseService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/courses`;

  readonly #list = signal<CourseSummary[]>([]);
  /** Cours du prof, du plus récemment modifié au plus ancien. */
  readonly list = this.#list.asReadonly();

  readonly #listLoading = signal(false);
  readonly listLoading = this.#listLoading.asReadonly();

  readonly #listError = signal(false);
  readonly listError = this.#listError.asReadonly();

  readonly #detail = signal<CourseDetail | null>(null);
  /** Cours ouvert dans l'espace blocs (`null` hors page ou pendant le fetch). */
  readonly detail = this.#detail.asReadonly();

  readonly #detailLoading = signal(false);
  readonly detailLoading = this.#detailLoading.asReadonly();

  readonly #detailError = signal(false);
  readonly detailError = this.#detailError.asReadonly();

  readonly #importState = signal<ImportState>(IMPORT_IDLE);
  /** État de l'import d'archive en cours (consommé par la modale d'import). */
  readonly importState = this.#importState.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#list.set([]);
        this.#detail.set(null);
        this.#importState.set(IMPORT_IDLE);
      }
    });
  }

  /** (Re)charge la liste — appelé à chaque entrée sur « Mes cours ». */
  loadList(): void {
    if (this.#listLoading()) {
      return;
    }
    this.#listLoading.set(true);
    this.#listError.set(false);
    this.#http.get<CourseSummary[]>(this.#url).subscribe({
      next: (courses) => {
        this.#list.set(courses);
        this.#listLoading.set(false);
      },
      error: () => {
        this.#listError.set(true);
        this.#listLoading.set(false);
      },
    });
  }

  /** (Re)charge un cours et ses blocs — appelé à chaque entrée d'espace blocs. */
  loadDetail(id: string): void {
    this.#detail.set(null);
    this.#detailLoading.set(true);
    this.#detailError.set(false);
    this.#http.get<CourseDetail>(`${this.#url}/${id}`).subscribe({
      next: (course) => {
        this.#detail.set(course);
        this.#detailLoading.set(false);
      },
      error: () => {
        this.#detailError.set(true);
        this.#detailLoading.set(false);
      },
    });
  }

  /** Crée un cours ; la liste sera refetchée à la prochaine visite. */
  createCourse(payload: CourseCreatePayload): Promise<CourseSummary> {
    return firstValueFrom(this.#http.post<CourseSummary>(this.#url, payload));
  }

  /**
   * Archive `.zip` d'export du cours (manifest + ressources + modules).
   * Premier `responseType: 'blob'` du projet : l'endpoint exige le Bearer
   * (attaché par l'intercepteur, URL sous `apiUrl`) — impossible de passer
   * par `window.open` comme pour les URL S3 présignées. Le téléchargement
   * effectif passe par `downloadBlob` (course-transfer.utils).
   */
  exportCourse(courseId: string): Promise<Blob> {
    return firstValueFrom(
      this.#http.get(`${this.#url}/${courseId}/export`, { responseType: 'blob' }),
    );
  }

  /**
   * Importe une archive d'export : le back recrée un cours complet (nouveaux
   * ids). Premier POST `FormData` multipart du projet — ne JAMAIS poser de
   * `Content-Type` manuel, le navigateur écrit lui-même le boundary.
   * `reportProgress` alimente le signal `importState` ; le cours créé est
   * inséré en tête de `list` (tri « modifié récemment » du back).
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
      this.#list.update((courses) => [course, ...courses]);
      this.#importState.set(IMPORT_IDLE);
      return course;
    } catch (error) {
      this.#importState.set({ phase: 'error', progress: 0 });
      throw error;
    }
  }

  /**
   * Supprime un cours et tout son contenu. Le retire du signal `list` et
   * nulle `detail` s'il affichait ce cours (l'appelant redirige vers la liste).
   */
  async deleteCourse(courseId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url}/${courseId}`));
    this.#list.update((courses) => courses.filter((course) => course.id !== courseId));
    if (this.#detail()?.id === courseId) {
      this.#detail.set(null);
    }
  }

  /**
   * Ajoute un bloc en fin de cours et l'insère dans le détail chargé. Le méta
   * (titre/description) est optionnel : les clés absentes valent `null` côté back.
   */
  async addBlock(
    courseId: string,
    type: BlockType,
    meta?: Partial<BlockMetaPayload>,
  ): Promise<CourseBlock> {
    const block = await firstValueFrom(
      this.#http.post<CourseBlock>(`${this.#url}/${courseId}/blocks`, { type, ...meta }),
    );
    this.#patchDetail(courseId, (detail) => ({
      ...detail,
      blocks: [...detail.blocks, block],
      block_count: detail.block_count + 1,
    }));
    return block;
  }

  /** Supprime un bloc et le retire du détail chargé. */
  async deleteBlock(courseId: string, blockId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url}/${courseId}/blocks/${blockId}`));
    this.#patchDetail(courseId, (detail) => ({
      ...detail,
      blocks: detail.blocks.filter((block) => block.id !== blockId),
      block_count: detail.block_count - 1,
    }));
  }

  /** Remplace le contenu d'un bloc et répercute la réponse dans le détail chargé. */
  async updateBlockContent(
    courseId: string,
    blockId: string,
    content: Record<string, unknown>,
  ): Promise<CourseBlock> {
    const block = await firstValueFrom(
      this.#http.patch<CourseBlock>(`${this.#url}/${courseId}/blocks/${blockId}`, { content }),
    );
    this.#patchDetail(courseId, (detail) => ({
      ...detail,
      blocks: detail.blocks.map((b) => (b.id === blockId ? block : b)),
    }));
    return block;
  }

  /**
   * Met à jour titre/description d'un bloc (tous types) et répercute la réponse
   * dans le détail chargé. Envoie exactement les clés du méta (jamais `content`) :
   * le PATCH partiel du back applique les clés présentes, `null` efface un champ.
   */
  async updateBlockMeta(
    courseId: string,
    blockId: string,
    meta: BlockMetaPayload,
  ): Promise<CourseBlock> {
    const block = await firstValueFrom(
      this.#http.patch<CourseBlock>(`${this.#url}/${courseId}/blocks/${blockId}`, meta),
    );
    this.#patchDetail(courseId, (detail) => ({
      ...detail,
      blocks: detail.blocks.map((b) => (b.id === blockId ? block : b)),
    }));
    return block;
  }

  /**
   * Pointe (ou détache, avec `null`) la ressource d'un bloc `document` et
   * répercute la réponse dans le détail chargé. PATCH dédié : le choix de
   * ressource est une sélection discrète, jamais mêlée au `content` ni au méta.
   */
  async updateBlockResource(
    courseId: string,
    blockId: string,
    resourceId: string | null,
  ): Promise<CourseBlock> {
    const block = await firstValueFrom(
      this.#http.patch<CourseBlock>(`${this.#url}/${courseId}/blocks/${blockId}`, {
        resource_id: resourceId,
      }),
    );
    this.#patchDetail(courseId, (detail) => ({
      ...detail,
      blocks: detail.blocks.map((b) => (b.id === blockId ? block : b)),
    }));
    return block;
  }

  /**
   * Pointe (ou détache, avec `null`) le module interactif d'un bloc `module`
   * et répercute la réponse dans le détail chargé. PATCH dédié — miroir
   * d'`updateBlockResource` pour la bibliothèque de modules.
   */
  async updateBlockModule(
    courseId: string,
    blockId: string,
    moduleId: string | null,
  ): Promise<CourseBlock> {
    const block = await firstValueFrom(
      this.#http.patch<CourseBlock>(`${this.#url}/${courseId}/blocks/${blockId}`, {
        module_id: moduleId,
      }),
    );
    this.#patchDetail(courseId, (detail) => ({
      ...detail,
      blocks: detail.blocks.map((b) => (b.id === blockId ? block : b)),
    }));
    return block;
  }

  /**
   * Change le régime d'accès élève du cours (J2) et patche localement les
   * signaux `detail` et `list` — passer en `en_cours` suspend les liens de
   * partage côté back, rien d'autre à rafraîchir ici.
   */
  async updateVisibility(courseId: string, visibilite: CourseVisibility): Promise<void> {
    await firstValueFrom(
      this.#http.put<{ visibilite: CourseVisibility }>(
        `${this.#url}/${courseId}/visibility`,
        { visibilite },
      ),
    );
    this.#patchDetail(courseId, (detail) => ({ ...detail, visibilite }));
    this.#list.update((courses) =>
      courses.map((course) => (course.id === courseId ? { ...course, visibilite } : course)),
    );
  }

  /**
   * Réécrit l'ordre complet des blocs. Approche optimiste : le signal est
   * réordonné (positions 0..n-1, comme le back) **avant** le PUT — feedback
   * immédiat pour le glisser-déposer. Sur erreur, le PUT rejette et l'appelant
   * resynchronise via `loadDetail` (ce qui écrase l'ordre optimiste).
   */
  async reorderBlocks(courseId: string, blockIds: string[]): Promise<void> {
    this.#applyBlockOrder(courseId, blockIds);
    await firstValueFrom(
      this.#http.put<void>(`${this.#url}/${courseId}/blocks/order`, { block_ids: blockIds }),
    );
  }

  /** Réordonne le signal `detail` selon `blockIds` (positions 0..n-1), sans HTTP. */
  #applyBlockOrder(courseId: string, blockIds: string[]): void {
    const rank = new Map(blockIds.map((id, i) => [id, i]));
    this.#patchDetail(courseId, (detail) => ({
      ...detail,
      blocks: [...detail.blocks]
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        .map((block, i) => ({ ...block, position: i })),
    }));
  }

  /** Applique une mise à jour au détail s'il correspond toujours au cours muté. */
  #patchDetail(courseId: string, patch: (detail: CourseDetail) => CourseDetail): void {
    const detail = this.#detail();
    if (detail?.id === courseId) {
      this.#detail.set(patch(detail));
    }
  }
}
