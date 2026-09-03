import { HttpClient, HttpParams } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

/** Tentatives des élèves sur un exercice, par id de question (vue professeur). */
export interface SubmissionSummary {
  total: number;
  byQuestion: Readonly<Record<string, number>>;
}

interface SubmissionSummaryRead {
  total: number;
  by_question: Record<string, number>;
}

/**
 * Côté professeur : résumé et effacement des tentatives des élèves sur un
 * exercice (API `/v1/courses/{id}/blocks/{id}/submissions`, Bearer
 * automatique). Patron mutable à signaux scopé à un bloc `(courseId,
 * blockId)` — `summary` refetché à chaque éditeur d'exercice ouvert
 * (`loadSummary`), purgé à la déconnexion ; `clear` efface tout le bloc ou une
 * question (`questionId`) et **patche le résumé localement** (pas de refetch),
 * en retournant le nombre effacé pour le toast de l'hôte (rejette sur échec).
 */
@Injectable({ providedIn: 'root' })
export class ExerciseSubmissionsService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);

  #courseId: string | null = null;
  #blockId: string | null = null;

  readonly #summary = signal<SubmissionSummary | null>(null);
  /** Résumé du bloc chargé (`null` tant qu'inconnu ou en erreur). */
  readonly summary = this.#summary.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#reset();
      }
    });
  }

  async loadSummary(courseId: string, blockId: string): Promise<void> {
    this.#reset();
    this.#courseId = courseId;
    this.#blockId = blockId;
    try {
      const read = await firstValueFrom(
        this.#http.get<SubmissionSummaryRead>(`${this.#base(courseId, blockId)}/summary`),
      );
      if (this.#isCurrent(courseId, blockId)) {
        this.#summary.set({ total: read.total, byQuestion: read.by_question });
      }
    } catch {
      // Résumé indisponible : l'éditeur n'affiche pas les boutons (rien à effacer de connu).
    }
  }

  /** Efface les tentatives de TOUS les élèves (bloc entier si `questionId` est `null`). */
  async clear(courseId: string, blockId: string, questionId: string | null): Promise<number> {
    let params = new HttpParams();
    if (questionId !== null) {
      params = params.set('question_id', questionId);
    }
    const result = await firstValueFrom(
      this.#http.delete<{ deleted: number }>(this.#base(courseId, blockId), { params }),
    );
    if (this.#isCurrent(courseId, blockId)) {
      this.#summary.update((summary) => {
        if (summary === null) {
          return summary;
        }
        if (questionId === null) {
          return { total: 0, byQuestion: {} };
        }
        const { [questionId]: removed = 0, ...rest } = summary.byQuestion;
        return { total: Math.max(0, summary.total - removed), byQuestion: rest };
      });
    }
    return result.deleted;
  }

  #base(courseId: string, blockId: string): string {
    return `${environment.apiUrl}/v1/courses/${courseId}/blocks/${blockId}/submissions`;
  }

  #isCurrent(courseId: string, blockId: string): boolean {
    return this.#courseId === courseId && this.#blockId === blockId;
  }

  #reset(): void {
    this.#courseId = null;
    this.#blockId = null;
    this.#summary.set(null);
  }
}
