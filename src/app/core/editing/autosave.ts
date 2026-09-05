import { Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, debounceTime, Observable, tap } from 'rxjs';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export const AUTOSAVE_DELAY_MS = 1500;

export interface AutosaveOptions<T> {
  /** Déclencheurs (frappes) : seule l'émission compte, le payload est relu à l'envoi. */
  triggers: Observable<unknown>;
  /** Payload courant ; `null` = pas d'éditeur monté, rien à envoyer. */
  current: () => T | null;
  /**
   * Envoie le payload. Peut rendre le payload **canonique** persisté (ids
   * réécrits par le back) : c'est lui qui devient la référence « à jour ».
   */
  save: (payload: T) => Promise<T | void>;
  delay?: number;
}

export interface Autosave<T> {
  readonly state: Signal<SaveState>;
  /** Fige la référence « dernier persisté » — init unique depuis le contenu chargé. */
  init(persisted: T): void;
  /** Sauvegarde immédiate si quelque chose a changé (hook avant-tour du chat). */
  flush(): Promise<void>;
  /**
   * Flush fire-and-forget à la destruction de l'hôte : enchaîné derrière le
   * PATCH en vol s'il y en a un (l'ordre serveur de deux écritures
   * concurrentes n'est pas garanti), envoyé tout de suite sinon.
   */
  flushOnDestroy(): void;
}

/**
 * Pipeline d'autosave d'un éditeur : `triggers → dirty/idle → debounce →
 * concatMap(save)`. `concatMap`, jamais `switchMap` : une promesse de PATCH
 * n'est pas annulable, une réponse périmée écraserait la plus récente. Le flux
 * survit aux erreurs (état `error`, retentative à la frappe suivante) ; une
 * frappe pendant un envoi laisse l'état `dirty`, l'envoi suivant est en file.
 *
 * À créer dans un contexte d'injection (constructeur) : la souscription est
 * liée au cycle de vie de l'hôte.
 */
export function createAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
  const state = signal<SaveState>('idle');
  let initialized = false;
  /** JSON du dernier payload persisté (référence dirty/idle). */
  let lastSaved = '';
  /** Dernier payload frappé — repli du flush si l'éditeur enfant est déjà détruit. */
  let lastDraft: T | null = null;
  /** PATCH en vol (toujours résolu, jamais rejeté), `null` sinon. */
  let inFlight: Promise<void> | null = null;

  const isCurrent = (payload: T | null): boolean => JSON.stringify(payload) === lastSaved;

  const save = async (): Promise<void> => {
    if (!initialized) {
      return;
    }
    const payload = options.current();
    if (payload === null || isCurrent(payload)) {
      // Rien à envoyer, ou émission en file devenue redondante.
      return;
    }
    state.set('saving');
    const request = options.save(payload);
    const tracked = request.then(
      () => undefined,
      () => undefined,
    );
    inFlight = tracked;
    void tracked.then(() => {
      if (inFlight === tracked) {
        inFlight = null;
      }
    });
    try {
      const saved = await request;
      lastSaved = JSON.stringify(saved ?? payload);
      lastDraft = options.current() ?? lastDraft;
      state.set(isCurrent(options.current()) ? 'saved' : 'dirty');
    } catch {
      state.set('error');
    }
  };

  options.triggers
    .pipe(
      tap(() => {
        const payload = options.current();
        lastDraft = payload ?? lastDraft;
        state.set(isCurrent(payload) ? 'idle' : 'dirty');
      }),
      debounceTime(options.delay ?? AUTOSAVE_DELAY_MS),
      concatMap(() => save()),
      takeUntilDestroyed(),
    )
    .subscribe();

  return {
    state: state.asReadonly(),
    init(persisted: T): void {
      initialized = true;
      lastSaved = JSON.stringify(persisted);
    },
    flush: save,
    flushOnDestroy(): void {
      if (!initialized) {
        return;
      }
      const payload = options.current() ?? lastDraft;
      if (payload === null || isCurrent(payload)) {
        return;
      }
      const send = (): Promise<void> =>
        options.save(payload).then(
          () => undefined,
          () => undefined,
        );
      if (inFlight === null) {
        void send();
      } else {
        void inFlight.then(send);
      }
    },
  };
}
