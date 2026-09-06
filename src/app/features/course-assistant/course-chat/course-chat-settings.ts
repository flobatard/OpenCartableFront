import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { AssistantChatState } from '../../../core/course-assistant/assistant-chat-state';
import { conversationUsage, formatTokenCount } from '../../../core/course-assistant/usage';
import { LanguageService } from '../../../core/i18n/language.service';
import { AiSettingsDialog } from '../../settings/ai-settings-dialog/ai-settings-dialog';

/** Ids ARIA uniques par instance (compteur de module, jamais Date.now()). */
let uid = 0;

/**
 * Bandeau des réglages IA du chat (modes actifs de `CourseChat` — global et
 * block, jamais le placeholder) : modèle en service — la config personnelle
 * si une est enregistrée, sinon l'IA par défaut du serveur avec le compteur
 * du quota quotidien —, total de tokens de la conversation active (somme des
 * messages assistant, `conversationUsage` ; rien tant qu'aucun usage n'est
 * connu) et roue crantée ouvrant un menu (pattern APG menu button réduit)
 * dont « Sélectionner un autre modèle » ouvre la modale de réglages IA
 * (`AiSettingsDialog`).
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

  readonly #credentials = inject(AiCredentialsService);
  readonly #language = inject(LanguageService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Menu de la roue crantée. */
  protected readonly menuOpen = signal(false);
  protected readonly menuId = `chat-settings-${uid++}-menu`;
  protected readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  protected readonly settingsDialog = viewChild(AiSettingsDialog);

  /**
   * Credential affiché : `null` tant que rien n'est chargé, ou quand il n'y a
   * ni config personnelle ni fallback serveur (rien d'affichable).
   */
  protected readonly aiCreds = computed(() => {
    const creds = this.#credentials.credentials();
    return creds && (creds.provider !== null || creds.default_ai_available) ? creds : null;
  });

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
      if (creds && creds.provider === null && creds.default_ai_available) {
        void this.#credentials.refresh().catch(() => {});
      }
    });
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

  /** « Sélectionner un autre modèle » : ferme le menu, ouvre la modale. */
  protected openModelSettings(): void {
    this.menuOpen.set(false);
    this.settingsDialog()?.open();
  }
}
