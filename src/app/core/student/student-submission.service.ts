import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { createSseParser } from '../course-assistant/sse';
import { PublicCourseService } from '../public-courses/public-course.service';
import {
  CorrectionRequest,
  emptyThread,
  QuestionThread,
  SubmissionsRead,
  SubmissionTurn,
  TUTOR_EVENTS,
  TutorStreamEvent,
} from './exercise-correction';

/**
 * Fils du tuteur d'exercice pour l'élève **connecté** — patron mutable à
 * signaux, scopé à un bloc `(courseId, blockId)` : `threads` par id de
 * question, refetché à chaque bloc (`loadThreads`), purgé à la déconnexion.
 *
 * Deux transports, comme l'assistant de cours : le fil se lit par
 * `HttpClient` (URL sous `apiUrl` hors `/v1/public/` → Bearer attaché par
 * l'intercepteur OIDC) ; un tour se **streame** en `fetch` + `ReadableStream`
 * (hors intercepteur : `Authorization` posée depuis `AuthService.accessToken`,
 * seule couche qui connaît le token), parseur SSE partagé
 * (`createSseParser` au vocabulaire `TUTOR_EVENTS`). L'accès au cours reste
 * celui du régime public : le token de partage voyage en `?token=` depuis
 * `PublicCourseService.access()`.
 *
 * Un tour = `live` posé (bulle élève + texte du tuteur token par token) puis,
 * au `done`, replié en `SubmissionTurn` local (forme des lignes serveur) et le
 * corrigé révélé posé sur le fil ; sur `error`, le partiel devient un tour
 * sans verdict (le back l'a persisté de même) et `error` porte le statut.
 */
@Injectable({ providedIn: 'root' })
export class StudentSubmissionService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #courses = inject(PublicCourseService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  #courseId: string | null = null;
  #blockId: string | null = null;
  readonly #aborts = new Map<string, AbortController>();

  readonly #threads = signal<Readonly<Record<string, QuestionThread>>>({});
  /** Fils par id de question du bloc chargé (absent = jamais de tour). */
  readonly threads = this.#threads.asReadonly();

  readonly #loading = signal(false);
  readonly loading = this.#loading.asReadonly();
  readonly #loadError = signal(false);
  readonly loadError = this.#loadError.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#reset();
      }
    });
  }

  /** Charge les fils de l'élève sur un bloc (remplace l'état du bloc précédent). */
  async loadThreads(courseId: string, blockId: string): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    this.#reset();
    this.#courseId = courseId;
    this.#blockId = blockId;
    this.#loading.set(true);
    try {
      const read = await firstValueFrom(
        this.#http.get<SubmissionsRead>(`${this.#base(courseId, blockId)}/submissions`, {
          params: this.#params(),
        }),
      );
      if (!this.#isCurrent(courseId, blockId)) {
        return;
      }
      const threads: Record<string, QuestionThread> = {};
      for (const [questionId, thread] of Object.entries(read.questions)) {
        threads[questionId] = {
          turns: thread.turns,
          live: null,
          error: null,
          revealedAnswer: thread.revealed_answer,
        };
      }
      this.#threads.set(threads);
    } catch {
      if (this.#isCurrent(courseId, blockId)) {
        this.#loadError.set(true);
      }
    } finally {
      if (this.#isCurrent(courseId, blockId)) {
        this.#loading.set(false);
      }
    }
  }

  /** Streame un tour (réponse ou message) sur une question du bloc chargé. */
  async submit(courseId: string, request: CorrectionRequest): Promise<void> {
    const { blockId, questionId, kind, content } = request;
    if (!this.#isBrowser || !this.#isCurrent(courseId, blockId)) {
      return;
    }
    if (this.#aborts.has(questionId)) {
      return; // un tour est déjà en cours sur cette question
    }
    const abort = new AbortController();
    this.#aborts.set(questionId, abort);
    this.#patch(questionId, (thread) => ({
      ...thread,
      live: { kind, content, text: '' },
      error: null,
    }));

    let closed = false;
    try {
      const url = `${this.#base(courseId, blockId)}/questions/${encodeURIComponent(questionId)}/submissions/stream`;
      const query = this.#params().toString();
      const response = await fetch(query ? `${url}?${query}` : url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.#auth.accessToken}`,
        },
        body: JSON.stringify({ kind, content }),
        signal: abort.signal,
      });
      if (!response.ok || response.body === null) {
        this.#fail(questionId, response.status);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser<TutorStreamEvent>(TUTOR_EVENTS);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          closed = this.#handleEvent(questionId, event) || closed;
        }
      }
      if (!closed) {
        this.#fail(questionId, 0); // flux coupé sans done/error
      }
    } catch {
      if (!closed) {
        this.#fail(questionId, abort.signal.aborted ? null : 0);
      }
    } finally {
      if (this.#aborts.get(questionId) === abort) {
        this.#aborts.delete(questionId);
      }
    }
  }

  /** Interrompt le tour en cours d'une question (le partiel reste affiché). */
  stop(questionId: string): void {
    this.#aborts.get(questionId)?.abort();
  }

  #base(courseId: string, blockId: string): string {
    return `${environment.apiUrl}/v1/student/courses/${courseId}/blocks/${blockId}`;
  }

  /** Token de partage actif (accès `token`), sinon aucun paramètre. */
  #params(): HttpParams {
    let params = new HttpParams();
    const access = this.#courses.access();
    if (access?.mode === 'token') {
      params = params.set('token', access.key);
    }
    return params;
  }

  #isCurrent(courseId: string, blockId: string): boolean {
    return this.#courseId === courseId && this.#blockId === blockId;
  }

  #patch(questionId: string, update: (thread: QuestionThread) => QuestionThread): void {
    this.#threads.update((threads) => ({
      ...threads,
      [questionId]: update(threads[questionId] ?? emptyThread()),
    }));
  }

  /** Traite un événement ; vrai si le flux est clos (`done`/`error`). */
  #handleEvent(questionId: string, event: TutorStreamEvent): boolean {
    switch (event.type) {
      case 'token':
        this.#patch(questionId, (thread) =>
          thread.live === null
            ? thread
            : { ...thread, live: { ...thread.live, text: thread.live.text + event.delta } },
        );
        return false;
      case 'done':
        this.#patch(questionId, (thread) => {
          if (thread.live === null) {
            return thread;
          }
          const turn: SubmissionTurn = {
            id: event.submission_id,
            kind: thread.live.kind,
            content: thread.live.content,
            feedback: thread.live.text,
            verdict: event.verdict,
            effort: event.effort,
            revealed: event.revealed,
            created_at: new Date().toISOString(),
          };
          return {
            ...thread,
            turns: [...thread.turns, turn],
            live: null,
            error: null,
            revealedAnswer: event.revealed
              ? (event.expected_answer ?? thread.revealedAnswer)
              : thread.revealedAnswer,
          };
        });
        return true;
      case 'error':
        this.#fail(questionId, event.status);
        return true;
      default:
        return false;
    }
  }

  /**
   * Clôt le tour en échec : le partiel (bulle élève + texte reçu) devient un
   * tour local sans verdict — le back a persisté la ligne de même —, `error`
   * porte le statut (`null` = interruption volontaire, pas une erreur).
   */
  #fail(questionId: string, status: number | null): void {
    this.#patch(questionId, (thread) => {
      const live = thread.live;
      const turns =
        live === null
          ? thread.turns
          : [
              ...thread.turns,
              {
                id: `local-${Date.now()}`,
                kind: live.kind,
                content: live.content,
                feedback: live.text === '' ? null : live.text,
                verdict: null,
                effort: null,
                revealed: false,
                created_at: new Date().toISOString(),
              } satisfies SubmissionTurn,
            ];
      return { ...thread, turns, live: null, error: status };
    });
  }

  #reset(): void {
    for (const abort of this.#aborts.values()) {
      abort.abort();
    }
    this.#aborts.clear();
    this.#courseId = null;
    this.#blockId = null;
    this.#threads.set({});
    this.#loading.set(false);
    this.#loadError.set(false);
  }
}
