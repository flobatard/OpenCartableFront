import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  alignedReasoning,
  filterModels,
  modelListingSupported,
  payloadFromConfiguration,
} from '../../../core/ai-credentials/ai-credentials-form';
import {
  activeConfiguration,
  AiConfiguration,
  AiCredentialsPayload,
  KNOWN_REASONING_EFFORTS,
} from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { ProposalModeService } from '../../../core/course-assistant/proposal-mode.service';
import { conversationUsage, formatTokenCount } from '../../../core/course-assistant/usage';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AiSettingsDialog } from '../../settings/ai-settings-dialog/ai-settings-dialog';

/** Ids ARIA uniques par instance (compteur de module, jamais Date.now()). */
let uid = 0;

/**
 * Bandeau des réglages IA du chat (modes actifs de `CourseChat` — global et
 * block, jamais le placeholder) : modèle en service — la configuration
 * ACTIVE (son nom et son modèle) si une est sélectionnée, sinon l'IA par
 * défaut du serveur avec le compteur du quota quotidien —, préférences de
 * raisonnement de la configuration active (deux `<select>` compacts aux
 * options du catalogue back pour le couple enregistré — ses
 * `reasoning_options` —, enregistrés aussitôt par le PUT de la configuration
 * reconstruite, clé omise = conservée ; jamais pour l'IA par défaut), total
 * de tokens de la conversation active (somme des messages assistant,
 * `conversationUsage` ; rien tant qu'aucun usage n'est connu) et roue crantée
 * ouvrant un menu (pattern APG menu button réduit) : bascule rapide entre
 * l'IA par défaut et chaque configuration nommée (`menuitemradio`, un clic =
 * PUT `/active`), puis « Gérer les configurations… » qui ouvre la modale de
 * réglages IA (`AiSettingsDialog`).
 *
 * **Édition auto** (chats d'édition seulement, input `editing`) : interrupteur
 * du mode de décision des propositions HITL (`ProposalModeService`) —
 * désactivé, chaque proposition attend sa revue ; activé, `ProposalHost`
 * l'applique et l'accepte sans revue.
 *
 * **Sélecteur de modèle** : le libellé « nom · modèle » de la configuration
 * active est un bouton qui ouvre un panneau (même ancrage que le menu) avec un
 * champ à autocomplétion — suggestions du provider par `listModels` avec la
 * clé enregistrée de la configuration (`config_id`), chargées une fois par
 * configuration, filtrées par la saisie ; providers sans listing : saisie
 * libre. Choisir une suggestion ou valider la saisie par Entrée enregistre le
 * modèle sur la configuration active (PUT reconstruit, provider et clé
 * inchangés), préférences de raisonnement ramenées dans les options du
 * nouveau modèle (`alignedReasoning` après sonde du catalogue).
 *
 * L'instance d'état observée arrive par l'input `assistant` (celle du panneau
 * hôte : root en global, fournie par l'éditeur en mode block) — le compteur
 * est relu à chaque fin de tour streamé DE CE panneau servi par l'IA par
 * défaut (le back a consommé — ou remboursé — le quota pendant le flux).
 * `AiCredentialsService`, singleton, reste injecté directement.
 */
@Component({
  selector: 'app-course-chat-settings',
  imports: [TranslocoPipe, AiSettingsDialog],
  templateUrl: './course-chat-settings.html',
  styleUrl: './course-chat-settings.scss',
})
export class CourseChatSettings {
  readonly assistant = input.required<AssistantChatState>();
  /** Chat d'édition (bloc, module — flux HITL) : bascule du mode « édition auto ». */
  readonly editing = input(false);

  readonly #credentials = inject(AiCredentialsService);
  readonly #proposalMode = inject(ProposalModeService);
  readonly #language = inject(LanguageService);
  readonly #notifications = inject(NotificationService);
  readonly #transloco = inject(TranslocoService);
  readonly #injector = inject(Injector);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #uid = uid++;

  /** Menu de la roue crantée. */
  protected readonly menuOpen = signal(false);
  protected readonly menuId = `chat-settings-${this.#uid}-menu`;
  protected readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  protected readonly settingsDialog = viewChild(AiSettingsDialog);

  /** Panneau du sélecteur de modèle. */
  protected readonly modelPickerOpen = signal(false);
  protected readonly modelPickerId = `chat-settings-${this.#uid}-models`;
  protected readonly modelListId = `${this.modelPickerId}-list`;
  protected readonly modelTrigger = viewChild<ElementRef<HTMLButtonElement>>('modelTrigger');
  protected readonly modelInput = viewChild<ElementRef<HTMLInputElement>>('modelInput');
  /** Saisie du champ (vide = toutes les suggestions ; le placeholder montre le modèle actuel). */
  protected readonly modelQuery = signal('');
  /** Suggestions du provider ; `null` = jamais chargées pour cette configuration. */
  protected readonly modelOptions = signal<string[] | null>(null);
  protected readonly modelsLoading = signal(false);
  protected readonly modelsError = signal(false);
  /** Option surlignée au clavier (-1 = aucune). */
  protected readonly modelActiveIndex = signal(-1);
  /** Configuration dont les suggestions sont chargées (une sonde par configuration). */
  #modelsForConfig: string | null = null;

  /** PUT d'une préférence de raisonnement ou d'un modèle en cours : contrôles gelés. */
  protected readonly saving = signal(false);
  /** Bascule (PUT /active) en cours : les entrées du menu sont gelées. */
  protected readonly switching = signal(false);

  /** Configuration active (`null` = IA par défaut, ou rien de chargé). */
  protected readonly activeConfig = computed(() =>
    activeConfiguration(this.#credentials.credentials()),
  );
  protected readonly configurations = computed(
    () => this.#credentials.credentials()?.configurations ?? [],
  );
  protected readonly defaultAvailable = computed(
    () => this.#credentials.credentials()?.default_ai_available ?? false,
  );

  /**
   * Enveloppe affichée : `null` tant que rien n'est chargé, ou quand il n'y a
   * ni configuration active ni fallback serveur (rien d'affichable).
   */
  protected readonly aiCreds = computed(() => {
    const creds = this.#credentials.credentials();
    return creds && (this.activeConfig() !== null || creds.default_ai_available) ? creds : null;
  });

  /** L'IA par défaut est en service (compteur de quota affiché). */
  protected readonly usingDefault = computed(
    () => this.aiCreds() !== null && this.activeConfig() === null,
  );

  /**
   * Configuration active dont le couple (provider, modèle) a au moins une
   * option de raisonnement au catalogue ; `null` pour l'IA par défaut (la
   * préférence n'existe qu'avec une configuration) et pour un modèle sans option.
   */
  protected readonly reasoningConfig = computed(() => {
    const config = this.activeConfig();
    if (!config) {
      return null;
    }
    const options = config.reasoning_options;
    return options.toggle.length > 0 || options.efforts.length > 0 ? config : null;
  });

  /** Le provider de la configuration active sait lister ses modèles. */
  protected readonly modelListing = computed(() =>
    modelListingSupported(this.activeConfig()?.provider ?? null),
  );
  protected readonly filteredModels = computed(() =>
    filterModels(this.modelOptions() ?? [], this.modelQuery()),
  );
  protected readonly activeModelOptionId = computed(() =>
    this.modelPickerOpen() && this.modelActiveIndex() >= 0
      ? `${this.modelListId}-${this.modelActiveIndex()}`
      : null,
  );

  /** Mode « édition auto » des propositions HITL activé. */
  protected readonly autoEdit = computed(() => this.#proposalMode.mode() === 'auto');

  /** Messages restants du quota quotidien (jamais négatif). */
  protected readonly quotaRemaining = computed(() => {
    const creds = this.aiCreds();
    return creds ? Math.max(creds.daily_quota - creds.calls_today, 0) : 0;
  });

  /** Total de tokens de la conversation active (`null` sans usage connu : rien d'affiché). */
  protected readonly tokens = computed(() =>
    conversationUsage(this.assistant().active()?.messages ?? []),
  );

  /** Compteur de tokens dans la locale de l'UI (pas de DecimalPipe : locale fr non enregistrée). */
  protected formatTokens(value: number): string {
    return formatTokenCount(value, this.#language.lang());
  }

  /** Dernier état de flux observé (détection de fin de tour). */
  #wasStreaming = false;

  constructor() {
    // Échec silencieux : le bandeau reste simplement absent, le chat
    // fonctionne sans lui.
    if (this.#isBrowser) {
      void this.#credentials.ensureLoaded().catch(() => {});
    }

    // Fin de tour (streaming → idle/error, Stop compris) : si le tour était
    // servi par l'IA par défaut, on relit le compteur. `untracked` : la
    // relecture écrit le signal credentials, qui ne doit pas re-déclencher
    // cet effect.
    effect(() => {
      const state = this.assistant().streamState();
      const ended = this.#wasStreaming && state !== 'streaming';
      this.#wasStreaming = state === 'streaming';
      if (!ended) {
        return;
      }
      const creds = untracked(this.#credentials.credentials);
      if (creds && activeConfiguration(creds) === null && creds.default_ai_available) {
        void this.#credentials.refresh().catch(() => {});
      }
    });

    // Changement de configuration active : le sélecteur de modèle se referme
    // (ses suggestions appartiennent à l'ancienne configuration).
    effect(() => {
      const id = this.activeConfig()?.id ?? null;
      untracked(() => {
        if (id !== this.#modelsForConfig) {
          this.closeModelPicker();
        }
      });
    });
  }

  protected toggleAutoEdit(): void {
    this.#proposalMode.toggle();
  }

  protected toggleMenu(): void {
    this.menuOpen.set(!this.menuOpen());
  }

  /** Escape : ferme le menu et rend le focus à la roue crantée. */
  protected onMenuEscape(): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    this.menuTrigger()?.nativeElement.focus();
  }

  /** Ferme si le focus quitte le groupe roue crantée + menu (comme user-menu). */
  protected onMenuFocusout(event: FocusEvent): void {
    const wrapper = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && !wrapper.contains(next)) {
      this.menuOpen.set(false);
    }
  }

  /** « Gérer les configurations… » : ferme le menu, ouvre la modale. */
  protected openModelSettings(): void {
    this.menuOpen.set(false);
    this.settingsDialog()?.open();
  }

  /**
   * Bascule rapide depuis le menu (`null` = IA par défaut) : ferme le menu,
   * PUT `/active` ; la réponse met à jour le signal (libellé, sélecteurs,
   * quota). Rien si la cible est déjà active ; un échec remonte en toast.
   */
  protected async selectConfiguration(id: string | null): Promise<void> {
    this.menuOpen.set(false);
    const current = this.activeConfig()?.id ?? null;
    if (id === current || this.switching()) {
      return;
    }
    this.switching.set(true);
    try {
      await this.#credentials.activate(id);
    } catch {
      this.#notifications.error(this.#transloco.translate('courseChat.config.switchError'));
    } finally {
      this.switching.set(false);
    }
  }

  // ------------------------------------------------------ sélecteur de modèle

  protected toggleModelPicker(): void {
    if (this.modelPickerOpen()) {
      this.closeModelPicker();
    } else {
      this.openModelPicker();
    }
  }

  /** Ouvre le panneau, focalise le champ (après rendu, zoneless) et charge les suggestions. */
  protected openModelPicker(): void {
    const config = this.activeConfig();
    if (!config) {
      return;
    }
    this.modelQuery.set('');
    this.modelActiveIndex.set(-1);
    this.modelPickerOpen.set(true);
    afterNextRender(() => this.modelInput()?.nativeElement.focus(), {
      injector: this.#injector,
    });
    void this.#ensureModelsLoaded(config);
  }

  protected closeModelPicker(): void {
    this.modelPickerOpen.set(false);
    this.modelActiveIndex.set(-1);
  }

  /** Escape : ferme le panneau et rend le focus au bouton du modèle. */
  protected onModelPickerEscape(): void {
    if (!this.modelPickerOpen()) {
      return;
    }
    this.closeModelPicker();
    this.modelTrigger()?.nativeElement.focus();
  }

  /** Ferme si le focus quitte le groupe bouton + panneau. */
  protected onModelPickerFocusout(event: FocusEvent): void {
    const wrapper = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && !wrapper.contains(next)) {
      this.closeModelPicker();
    }
  }

  protected onModelQueryInput(event: Event): void {
    this.modelQuery.set((event.target as HTMLInputElement).value);
    this.modelActiveIndex.set(-1);
  }

  /** Flèches : surlignage ; Entrée : la suggestion surlignée, sinon la saisie telle quelle. */
  protected onModelInputKeydown(event: KeyboardEvent): void {
    const options = this.filteredModels();
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      this.modelActiveIndex.set((this.modelActiveIndex() + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      this.modelActiveIndex.set(
        (this.modelActiveIndex() - 1 + options.length) % options.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const highlighted = options[this.modelActiveIndex()];
      const typed = this.modelQuery().trim();
      const model = highlighted ?? (typed || null);
      if (model !== null) {
        this.pickModel(model);
      }
    }
  }

  /** Choix d'un modèle : referme le panneau, rend le focus au bouton, enregistre. */
  protected pickModel(model: string): void {
    this.closeModelPicker();
    this.modelTrigger()?.nativeElement.focus();
    void this.#applyModel(model);
  }

  /** Sonde le provider une seule fois par configuration (clé enregistrée via `config_id`). */
  async #ensureModelsLoaded(config: AiConfiguration): Promise<void> {
    if (!modelListingSupported(config.provider)) {
      this.modelOptions.set(null);
      this.modelsError.set(false);
      this.#modelsForConfig = config.id;
      return;
    }
    if (this.#modelsForConfig === config.id && (this.modelOptions() !== null || this.modelsError())) {
      return;
    }
    this.#modelsForConfig = config.id;
    this.modelOptions.set(null);
    this.modelsError.set(false);
    this.modelsLoading.set(true);
    try {
      const models = await this.#credentials.listModels({
        provider: config.provider,
        base_url: config.base_url,
        config_id: config.id,
      });
      if (this.#modelsForConfig === config.id) {
        this.modelOptions.set(models);
      }
    } catch {
      if (this.#modelsForConfig === config.id) {
        this.modelsError.set(true);
      }
    } finally {
      this.modelsLoading.set(false);
    }
  }

  /**
   * Enregistre le modèle sur la configuration active (provider, clé et nom
   * inchangés) ; les préférences de raisonnement sont ramenées dans les
   * options du nouveau modèle (sonde du catalogue ; en cas d'échec de la
   * sonde, transmises telles quelles — le back ne gate que par provider).
   */
  async #applyModel(model: string): Promise<void> {
    const config = this.activeConfig();
    if (!config || model === config.model || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      let preferences = { reasoning: config.reasoning, reasoning_effort: config.reasoning_effort };
      try {
        const options = await this.#credentials.reasoningOptions({
          provider: config.provider,
          model,
        });
        preferences = alignedReasoning(config.reasoning, config.reasoning_effort, options);
      } catch {
        // Catalogue injoignable : le provider tranchera.
      }
      await this.#credentials.update(config.id, {
        ...payloadFromConfiguration(config),
        model,
        ...preferences,
      });
    } catch {
      this.#notifications.error(this.#transloco.translate('courseChat.config.modelError'));
    } finally {
      this.saving.set(false);
    }
  }

  // ------------------------------------------------------ raisonnement

  /** Valeur d'option du sélecteur de raisonnement pour l'état enregistré. */
  protected reasoningOption(reasoning: boolean | null): string {
    return reasoning === null ? '' : reasoning ? 'on' : 'off';
  }

  /** Un niveau connu de l'UI a un libellé i18n ; un autre s'affiche tel quel. */
  protected isKnownEffort(effort: string): boolean {
    return (KNOWN_REASONING_EFFORTS as readonly string[]).includes(effort);
  }

  protected onReasoningChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    const previous = this.reasoningOption(this.reasoningConfig()?.reasoning ?? null);
    void this.#savePreference(
      { reasoning: value === '' ? null : value === 'on' },
      select,
      previous,
    );
  }

  protected onEffortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    const efforts = this.reasoningConfig()?.reasoning_options.efforts ?? [];
    const effort = efforts.includes(value) ? value : null;
    const previous = this.reasoningConfig()?.reasoning_effort ?? '';
    void this.#savePreference({ reasoning_effort: effort }, select, previous);
  }

  /**
   * Enregistre une préférence par le PUT de la configuration active
   * reconstruite (clé omise = conservée) ; la réponse met à jour le signal,
   * donc les options `[selected]`. En cas d'échec le signal n'a pas bougé
   * (aucun re-rendu) : le sélecteur est remis à la main sur la valeur
   * enregistrée, et un toast (message déjà traduit, convention du repo)
   * signale l'échec.
   */
  async #savePreference(
    patch: Partial<Pick<AiCredentialsPayload, 'reasoning' | 'reasoning_effort'>>,
    select: HTMLSelectElement,
    previous: string,
  ): Promise<void> {
    const config = this.reasoningConfig();
    if (!config) {
      return;
    }
    this.saving.set(true);
    try {
      await this.#credentials.update(config.id, { ...payloadFromConfiguration(config), ...patch });
    } catch {
      select.value = previous;
      this.#notifications.error(this.#transloco.translate('courseChat.config.reasoningError'));
    } finally {
      this.saving.set(false);
    }
  }
}
