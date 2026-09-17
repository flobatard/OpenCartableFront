import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { CourseBlock, ExerciseContentPayload } from '../courses/course.model';
import { CourseService } from '../courses/course.service';
import { applyExerciseProposal } from '../courses/exercise-apply';
import { payloadFromBlockContent } from '../courses/exercise-form';
import { ModuleDetail } from '../modules/module.model';
import { ModuleService } from '../modules/module.service';
import { AssistantChatState } from './assistant-chat-state';
import { AssistantDelegation, DELEGATION_TOOLS, parseDelegation } from './delegation';
import { GlobalEditService } from './global-edit.service';
import { ProposalHost } from './proposal-host';
import { ProposalModeService } from './proposal-mode.service';
import {
  AssistantExerciseProposal,
  AssistantModuleProposal,
  AssistantPendingProposal,
  MODULE_FILE_BY_KIND,
} from './proposals';
import { revealOnNewQuestions } from './question-reveal';
import { TargetApplierRegistry } from './target-applier.registry';

export type { AssistantStreamState, AssistantToolActivity } from './assistant-chat-state';

/** Proposition de réécriture d'un bloc texte. */
export type AssistantTextProposal = Extract<AssistantPendingProposal, { kind: 'block_text' }>;

/**
 * Ce que la revue globale affiche pour une proposition de sous-assistant :
 * la revue texte (diff sur l'« original » figé), exercice (état courant de
 * l'exercice) ou module (code courant du fichier visé), avec le titre de la
 * cible.
 */
export type GlobalReviewView =
  | { kind: 'text'; proposal: AssistantTextProposal; original: string; targetTitle: string }
  | {
      kind: 'exercise';
      proposal: AssistantExerciseProposal;
      current: ExerciseContentPayload;
      targetTitle: string;
    }
  | { kind: 'module'; proposal: AssistantModuleProposal; original: string; targetTitle: string };

type ReviewTarget = CourseBlock | ModuleDetail;

function isBlock(target: ReviewTarget): target is CourseBlock {
  return 'content' in target;
}

function markdownOf(block: CourseBlock): string {
  const markdown = block.content['markdown'];
  return typeof markdown === 'string' ? markdown : '';
}

/**
 * Assistant IA du contexte GLOBAL d'un cours — l'instance root d'
 * `AssistantChatState` (portée `course`, défaut), consommée par le panneau
 * flottant `assistant-panel` monté une fois dans le shell. Les chats ancrés
 * des éditeurs (contextes d'édition) fournissent leur PROPRE instance
 * d'`AssistantChatState` au niveau du composant hôte : ce service n'ajoute que
 * l'état propre au panneau flottant — et l'**hôte des propositions de
 * sous-assistants** (édition globale, `delegation.ts`).
 *
 * Édition globale : quand `GlobalEditService` l'autorise, chaque tour part
 * avec `allow_edit` ; l'assistant peut alors confier un bloc ou un module à un
 * sous-assistant, dont les propositions arrivent ici (`pendingProposal`
 * rattachée à sa `delegation`). `proposals` (`ProposalHost`) les revoit dans
 * la fenêtre globale (`app-global-proposal-review`, hébergée par l'outlet :
 * visible sur toute page du cours) et les applique **sur la cible** — via
 * l'éditeur s'il est monté (`TargetApplierRegistry` : Monaco, Ctrl-Z, flush
 * d'autosave), sinon par un PATCH headless (`CourseService`,
 * `ModuleService`, qui patchent leurs signaux : la page cours suit) — puis
 * reprend le run. La cible est préchargée dès l'appel `edit_*` (la revue en a
 * besoin avant la proposition) ; l'« original » du diff est figé par
 * proposition (une application en mode auto ne doit pas vider le diff du
 * repli sur la revue manuelle). Le mode « Édition auto » (`ProposalModeService`)
 * s'applique comme dans les éditeurs.
 */
@Injectable({ providedIn: 'root' })
export class CourseAssistantService extends AssistantChatState {
  readonly #globalEdit = inject(GlobalEditService);
  readonly #proposalMode = inject(ProposalModeService);
  readonly #courses = inject(CourseService);
  readonly #modules = inject(ModuleService);
  readonly #appliers = inject(TargetApplierRegistry);

  /**
   * État déplié/replié du panneau assistant flottant : l'assistant ouvert
   * reste ouvert quand l'utilisateur navigue — notamment en suivant une
   * citation `oc-block:` vers l'éditeur du bloc cité. Volontairement hors du
   * reset de la classe de base : changer de cours ne referme pas le panneau ;
   * seul un signal de déconnexion le replie.
   */
  readonly #panelOpen = signal(false);
  readonly panelOpen = this.#panelOpen.asReadonly();

  /** Cibles chargées pour la revue (bloc ou module), par id — rafraîchies à chaque application. */
  readonly #targets = signal<ReadonlyMap<string, ReviewTarget>>(new Map());
  /** Requêtes de cible en vol, par id de cible (une application en mode auto les attend). */
  readonly #targetRequests = new Map<string, Promise<ReviewTarget | null>>();
  /** Délégations dont la cible a été demandée (une requête par délégation). */
  readonly #fetchedDelegations = new Set<string>();
  /** Revues figées par id de proposition (« original » d'avant l'application). */
  readonly #frozen = new Map<string, GlobalReviewView>();

  /** Hôte des propositions de sous-assistants (doc de classe). */
  readonly proposals = new ProposalHost<GlobalReviewView>({
    state: this,
    buildReview: (proposal) => this.#buildReview(proposal),
    apply: (proposal) => this.#apply(proposal),
    autoAccept: (proposal) => this.#proposalMode.shouldAutoAccept(proposal),
  });

  /**
   * Fenêtre de revue affichée : ouverte à chaque nouvelle revue, refermée
   * avec elle ou par le professeur (Escape, croix — la proposition attend
   * toujours ; « Revoir » la rouvre).
   */
  readonly #reviewVisible = signal(false);
  readonly reviewVisible = this.#reviewVisible.asReadonly();

  constructor() {
    super();
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.#panelOpen.set(false);
      }
    });
    // Des questions attendent le professeur : le panneau replié se déplie.
    revealOnNewQuestions(this, () => this.#panelOpen.set(true));

    // Cible d'une délégation préchargée dès l'appel `edit_*` : la revue de la
    // proposition à venir en a besoin (contenu courant = « original »).
    effect(() => {
      for (const entry of this.toolActivity()) {
        if (!DELEGATION_TOOLS.has(entry.name)) {
          continue;
        }
        const delegation = parseDelegation(entry);
        if (delegation !== null) {
          untracked(() => this.#ensureTarget(delegation));
        }
      }
    });

    // Nouvelle revue : la fenêtre s'ouvre et le panneau se déplie (le fil
    // montre la délégation en cours) ; revue refermée : plus rien à montrer.
    let reviewedId: string | null = null;
    effect(() => {
      const id = this.proposals.review()?.proposal.id ?? null;
      if (id === reviewedId) {
        return;
      }
      reviewedId = id;
      untracked(() => {
        this.#reviewVisible.set(id !== null);
        if (id !== null) {
          this.#panelOpen.set(true);
        }
      });
    });

    // Proposition consommée ou abandonnée : état de décision et originaux
    // figés repartent à zéro.
    effect(() => {
      if (this.pendingProposal() === null) {
        untracked(() => {
          this.proposals.reset();
          this.#frozen.clear();
        });
      }
    });
  }

  setPanelOpen(open: boolean): void {
    this.#panelOpen.set(open);
  }

  /** Rouvre la fenêtre de revue d'une proposition encore en attente. */
  showReview(): void {
    if (this.proposals.review() !== null) {
      this.#reviewVisible.set(true);
    }
  }

  hideReview(): void {
    this.#reviewVisible.set(false);
  }

  /** Édition globale du panneau : `allow_edit` part avec le message quand elle est activée. */
  protected override turnOptions(): Record<string, unknown> {
    return this.#globalEdit.enabled() ? { allow_edit: true } : {};
  }

  override async loadConversations(courseId: string): Promise<void> {
    if (courseId !== this.currentCourseId()) {
      // Autre cours : les cibles chargées ne valent plus rien.
      this.#targets.set(new Map());
      this.#targetRequests.clear();
      this.#fetchedDelegations.clear();
      this.#frozen.clear();
    }
    await super.loadConversations(courseId);
  }

  #ensureTarget(delegation: AssistantDelegation): void {
    const courseId = this.currentCourseId();
    if (courseId === null || this.#fetchedDelegations.has(delegation.id)) {
      return;
    }
    this.#fetchedDelegations.add(delegation.id);
    const request: Promise<ReviewTarget | null> = (
      delegation.context === 'module'
        ? this.#modules.getModule(courseId, delegation.targetId)
        : this.#courses.fetchBlock(courseId, delegation.targetId)
    ).then(
      (target) => {
        if (target !== null) {
          this.#storeTarget(delegation.targetId, target);
        }
        return target;
      },
      // Cible injoignable : la revue reste en attente de chargement — le
      // professeur peut toujours rejeter.
      () => null,
    );
    this.#targetRequests.set(delegation.targetId, request);
  }

  /**
   * La cible d'une délégation : chargée, sinon celle de la requête en vol —
   * lancée ici au besoin (mode auto : l'acceptation automatique peut précéder
   * l'effect de préchargement).
   */
  async #target(delegation: AssistantDelegation): Promise<ReviewTarget | null> {
    const loaded = this.#targets().get(delegation.targetId);
    if (loaded) {
      return loaded;
    }
    this.#ensureTarget(delegation);
    const request = this.#targetRequests.get(delegation.targetId);
    return request ? await request : null;
  }

  #storeTarget(id: string, target: ReviewTarget): void {
    this.#targets.update((targets) => new Map(targets).set(id, target));
  }

  #buildReview(proposal: AssistantPendingProposal): GlobalReviewView | null {
    const frozen = this.#frozen.get(proposal.id);
    if (frozen) {
      return frozen;
    }
    const delegation = proposal.delegation;
    if (!delegation) {
      return null; // proposition sans délégation : rien à revoir ici
    }
    // Lecture TRACKÉE : la revue apparaît quand la cible est chargée.
    const target = this.#targets().get(delegation.targetId);
    if (!target) {
      return null;
    }
    const targetTitle = delegation.targetTitle;
    let view: GlobalReviewView | null = null;
    if (proposal.kind === 'block_text' && isBlock(target)) {
      view = { kind: 'text', proposal, original: markdownOf(target), targetTitle };
    } else if (proposal.kind.startsWith('exercise_') && isBlock(target)) {
      view = {
        kind: 'exercise',
        proposal: proposal as AssistantExerciseProposal,
        current: payloadFromBlockContent(target.content),
        targetTitle,
      };
    } else if (proposal.kind.startsWith('module_') && !isBlock(target)) {
      const modular = proposal as AssistantModuleProposal;
      view = {
        kind: 'module',
        proposal: modular,
        original: target[MODULE_FILE_BY_KIND[modular.kind]],
        targetTitle,
      };
    }
    if (view !== null) {
      this.#frozen.set(proposal.id, view);
    }
    return view;
  }

  /**
   * Application sur la cible (doc de classe) : l'éditeur monté s'il y en a
   * un (puis flush de son autosave — le back relit la cible en base), sinon
   * PATCH headless dont la réponse rafraîchit la cible chargée. `false` =
   * cible introuvable ; une requête refusée rejette (erreur `apply`).
   */
  async #apply(proposal: AssistantPendingProposal): Promise<boolean> {
    const delegation = proposal.delegation;
    const courseId = this.currentCourseId();
    if (!delegation || courseId === null) {
      return false;
    }
    const applier = this.#appliers.get(delegation.targetId);
    if (applier !== null) {
      if (!applier.apply(proposal)) {
        return false;
      }
      await applier.flush();
      return true;
    }
    const target = await this.#target(delegation);
    if (target === null) {
      return false;
    }
    // « Original » figé AVANT le PATCH (mode auto : la cible a pu arriver
    // après la proposition) — un repli sur la revue manuelle montre le vrai diff.
    this.#buildReview(proposal);
    if (proposal.kind === 'block_text') {
      const block = await this.#courses.updateBlockContent(courseId, delegation.targetId, {
        markdown: proposal.markdown,
      });
      this.#storeTarget(delegation.targetId, block);
      return true;
    }
    if (proposal.kind.startsWith('exercise_')) {
      if (!isBlock(target)) {
        return false;
      }
      const next = applyExerciseProposal(
        payloadFromBlockContent(target.content),
        proposal as AssistantExerciseProposal,
      );
      if (next === null) {
        return false;
      }
      const block = await this.#courses.updateBlockContent(courseId, delegation.targetId, next);
      this.#storeTarget(delegation.targetId, block);
      return true;
    }
    if (isBlock(target)) {
      return false;
    }
    const modular = proposal as AssistantModuleProposal;
    const module = await this.#modules.updateModule(courseId, delegation.targetId, {
      [MODULE_FILE_BY_KIND[modular.kind]]: modular.code,
    });
    this.#storeTarget(delegation.targetId, module);
    return true;
  }
}
