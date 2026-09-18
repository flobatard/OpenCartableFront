import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { PostHog } from 'posthog-js';

import { environment } from '../../../environments/environment';
import { ConsentService } from '../consent/consent.service';
import { AnalyticsEventName, AnalyticsEvents } from './analytics.events';
import { isStudentUrl, scrubEvent } from './scrub';

/** Au-delà, les plus anciens événements en attente sont abandonnés. */
const MAX_QUEUE = 50;

/**
 * Textes masqués dans les enregistrements de session : sorties du modèle,
 * corrigés et données d'exploitation du backoffice. Le sélecteur masque
 * l'élément **et sa descendance** (rrweb remonte les ancêtres), donc viser le
 * conteneur suffit.
 *
 * Couplage assumé à des classes de template — `course-chat.html`,
 * `course-chat-questions.html`, `global-proposal-review.html`,
 * `exercise-view.html` et `admin-jobs.html`. Il est gardé par
 * `analytics.masking.spec.ts` : sans ce test, un renommage de classe
 * désactiverait le masquage en silence.
 */
export const REPLAY_MASK_SELECTOR = [
  '.course-chat__thread', // conversation de l'assistant du prof
  '.course-chat__thinking', // raisonnement streamé
  '.chat-questions', // questions de l'assistant, sous le fil
  '.global-proposal-review', // revue globale d'une proposition de sous-assistant
  '.exercise-view__thread', // fil du tuteur de l'élève
  '.exercise-view__revealed-answer', // corrigé dévoilé
  '.admin-jobs', // backoffice : clés S3, erreurs de passe, volumétrie
].join(', ');

interface QueuedEvent {
  name: AnalyticsEventName;
  properties: Record<string, unknown>;
}

/**
 * Mesure d'audience PostHog, sous consentement explicite.
 *
 * Opt-in strict : posthog-js n'est même pas TÉLÉCHARGÉ tant que la mesure n'est
 * pas autorisée par l'environnement **et** acceptée par l'utilisateur. Le
 * chargement passe par un `import()` dynamique — un import statique ferait
 * entrer ~70 ko dans le bundle initial de tous les déploiements, y compris ceux
 * qui ne mesurent rien.
 *
 * N'injecte QUE `PLATFORM_ID` et `ConsentService`, tous deux sans dépendance :
 * les services `core/` instrumentés restent testables sans provider
 * supplémentaire. Le câblage vers le routeur et vers l'identité vit dans
 * `app.config.ts`.
 *
 * Tout ce qui sort passe par `scrubEvent` (`before_send`) : PostHog ne voit que
 * des motifs de route, jamais un token de partage ni une saisie utilisateur.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #consent = inject(ConsentService);

  #posthog: PostHog | null = null;
  #loading = false;

  /** Événements émis avant la fin du chargement ; jetés si le consentement manque. */
  readonly #queue: QueuedEvent[] = [];

  /** Identité en attente, si `identify` arrive avant que posthog-js soit prêt. */
  #pendingIdentity: string | null = null;

  /** Dernière page connue : le replay est coupé sur les pages élèves. */
  readonly #onStudentPage = signal(false);

  readonly #recordingWanted = computed(
    () => this.#consent.sessionReplayGranted() && !this.#onStudentPage(),
  );

  constructor() {
    if (!this.#isBrowser || !this.#consent.configured) {
      return;
    }
    effect(() => {
      // `decision()` est lu pour lui-même : un REFUS ne change pas
      // `analyticsGranted()` (faux avant, faux après), et sans cette dépendance
      // l'effect ne se rejouerait pas — la file d'attente survivrait au refus.
      this.#consent.decision();
      if (this.#consent.analyticsGranted()) {
        void this.#start();
      } else {
        this.#stop();
      }
    });
    effect(() => {
      const wanted = this.#recordingWanted();
      const posthog = this.#posthog;
      if (!posthog) {
        return;
      }
      if (wanted) {
        posthog.startSessionRecording();
      } else {
        posthog.stopSessionRecording();
      }
    });
  }

  /** Émet un événement métier. Le typage impose les propriétés exactes de la carte. */
  capture<K extends AnalyticsEventName>(name: K, properties: AnalyticsEvents[K]): void {
    if (!this.#isBrowser || !this.#consent.configured) {
      return;
    }
    if (this.#posthog) {
      this.#posthog.capture(name, properties);
      return;
    }
    if (this.#queue.length >= MAX_QUEUE) {
      this.#queue.shift();
    }
    this.#queue.push({ name, properties: properties as Record<string, unknown> });
  }

  /**
   * Appelée à chaque `NavigationEnd` depuis `app.config.ts`. La vue de page
   * elle-même est capturée par posthog-js (`capture_pageview: 'history_change'`)
   * puis nettoyée par `before_send` : ici on ne décide que du replay, coupé sur
   * les pages élèves.
   */
  trackNavigation(url: string): void {
    this.#onStudentPage.set(isStudentUrl(url));
  }

  /**
   * Rattache les événements à un prof. Le `sub` OIDC seulement — jamais l'email
   * ni le nom, que `AuthService.identityClaims` expose pourtant.
   */
  identify(sub: string): void {
    if (!this.#isBrowser || !this.#consent.configured) {
      return;
    }
    if (this.#posthog) {
      this.#posthog.identify(sub);
    } else {
      this.#pendingIdentity = sub;
    }
  }

  /** Déconnexion : les événements suivants repartent sur une identité anonyme. */
  reset(): void {
    this.#pendingIdentity = null;
    this.#posthog?.reset();
  }

  async #start(): Promise<void> {
    if (this.#posthog || this.#loading) {
      return;
    }
    this.#loading = true;
    try {
      const { default: posthog } = await import('posthog-js');
      // Le consentement a pu être retiré pendant le chargement.
      if (!this.#consent.analyticsGranted()) {
        return;
      }
      posthog.init(environment.analytics.posthogKey, {
        api_host: environment.analytics.posthogHost,
        // Défauts figés : ce qui n'est pas réglé ici ne bougera pas d'une
        // version de posthog-js à l'autre.
        defaults: '2026-08-30',
        // Mesure large assumée : un profil de personne pour tout visiteur,
        // les élèves anonymes compris.
        person_profiles: 'always',
        // Capture automatique : clics et formulaires, clics de rage et clics
        // morts, cartes de chaleur, performances de chargement, exceptions JS.
        // La vue de page suit l'historique (le routeur Angular pousse l'état),
        // donc plus de capture manuelle ici.
        autocapture: true,
        rageclick: true,
        capture_heatmaps: true,
        capture_dead_clicks: true,
        capture_performance: true,
        capture_exceptions: true,
        capture_pageview: 'history_change',
        capture_pageleave: true,
        // Seule exception : pas de sondages dans l'app.
        disable_surveys: true,
        // NE PAS ajouter `advanced_disable_flags` ici : replay, cartes de
        // chaleur et autocapture lisent leur configuration distante dans la
        // réponse `/flags`. Sans elle, `startSessionRecording()` lève bien le
        // drapeau local mais n'enregistre jamais rien — panne silencieuse.
        persistence: 'localStorage+cookie',
        secure_cookie: environment.production,
        // L'API vit sur un sous-domaine frère (api.preprod…) : le cookie de
        // mesure reste sur l'hôte exact du front.
        cross_subdomain_cookie: false,
        // Le replay démarre à la demande, jamais au chargement, et jamais sur
        // une page élève. Saisies masquées partout, sorties du modèle et
        // corrigés masqués par sélecteur.
        disable_session_recording: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: REPLAY_MASK_SELECTOR,
        },
        before_send: (event) => {
          scrubEvent(event);
          return event;
        },
      });
      this.#posthog = posthog;
      if (this.#pendingIdentity) {
        posthog.identify(this.#pendingIdentity);
        this.#pendingIdentity = null;
      }
      for (const queued of this.#queue) {
        posthog.capture(queued.name, queued.properties);
      }
      if (this.#recordingWanted()) {
        posthog.startSessionRecording();
      }
    } catch {
      // Script bloqué, réseau coupé : la mesure est un service non essentiel.
    } finally {
      this.#queue.length = 0;
      this.#loading = false;
    }
  }

  /** Refus ou révocation : plus rien ne sort, et ce qui a été déposé est purgé. */
  #stop(): void {
    this.#queue.length = 0;
    this.#pendingIdentity = null;
    const posthog = this.#posthog;
    if (!posthog) {
      return;
    }
    posthog.stopSessionRecording();
    posthog.reset();
    posthog.opt_out_capturing();
  }
}
