import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  BlockMetaPayload,
  CourseBlock,
  CourseCreatePayload,
  CourseDetail,
  CourseSummary,
  CreatableBlockType,
} from './course.model';

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

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#list.set([]);
        this.#detail.set(null);
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
   * Ajoute un bloc en fin de cours et l'insère dans le détail chargé. Le méta
   * (titre/description) est optionnel : les clés absentes valent `null` côté back.
   */
  async addBlock(
    courseId: string,
    type: CreatableBlockType,
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
   * Réécrit l'ordre complet des blocs. Approche pessimiste : le signal n'est
   * réordonné (positions 0..n-1, comme le back) qu'à la réponse 204 ; sur
   * erreur, l'appelant resynchronise via `loadDetail`.
   */
  async reorderBlocks(courseId: string, blockIds: string[]): Promise<void> {
    await firstValueFrom(
      this.#http.put<void>(`${this.#url}/${courseId}/blocks/order`, { block_ids: blockIds }),
    );
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
