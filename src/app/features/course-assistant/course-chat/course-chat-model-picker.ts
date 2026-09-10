import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  filterModels,
  modelListingSupported,
} from '../../../core/ai-credentials/ai-credentials-form';
import { AiConfiguration } from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';

/** Ids ARIA uniques par instance (compteur de module, jamais Date.now()). */
let uid = 0;

/**
 * Sélecteur de modèle du pied de chat (`CourseChatSettings`) : le libellé
 * « nom · modèle » de la configuration active est un bouton qui ouvre un
 * panneau (ancré vers le haut, comme le menu de la roue) avec un champ à
 * autocomplétion — suggestions du provider par `listModels` avec la clé
 * enregistrée de la configuration (`config_id`), chargées une fois par
 * configuration, filtrées par la saisie ; providers sans listing : saisie
 * libre. Choisir une suggestion ou valider la saisie par Entrée referme le
 * panneau, rend le focus au bouton et émet `picked` : l'enregistrement (PUT
 * reconstruit, préférences de raisonnement réalignées) appartient à l'hôte.
 *
 * Escape referme et refocalise le bouton ; un focus qui quitte le groupe
 * bouton + panneau referme ; changer de configuration active referme (les
 * suggestions appartenaient à l'ancienne).
 */
@Component({
  selector: 'app-course-chat-model-picker',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-model-picker.html',
  styleUrl: './course-chat-model-picker.scss',
  host: {
    '(keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusout($event)',
  },
})
export class CourseChatModelPicker {
  /** Configuration active (celle dont on change le modèle). */
  readonly config = input.required<AiConfiguration>();
  /** Enregistrement ou bascule en cours chez l'hôte : bouton gelé. */
  readonly disabled = input(false);
  /** Modèle choisi (suggestion ou saisie libre, jamais vide). */
  readonly picked = output<string>();

  readonly #credentials = inject(AiCredentialsService);
  readonly #injector = inject(Injector);

  protected readonly expanded = signal(false);
  protected readonly popoverId = `model-picker-${uid++}`;
  protected readonly listId = `${this.popoverId}-list`;
  protected readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  /** Saisie du champ (vide = toutes les suggestions ; le placeholder montre le modèle actuel). */
  protected readonly query = signal('');
  /** Suggestions du provider ; `null` = jamais chargées pour cette configuration. */
  protected readonly options = signal<string[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  /** Option surlignée au clavier (-1 = aucune). */
  protected readonly activeIndex = signal(-1);
  /** Configuration dont les suggestions sont chargées (une sonde par configuration). */
  #loadedFor: string | null = null;

  /** Le provider de la configuration sait lister ses modèles. */
  protected readonly listing = computed(() => modelListingSupported(this.config().provider));
  protected readonly filtered = computed(() => filterModels(this.options() ?? [], this.query()));
  protected readonly activeOptionId = computed(() =>
    this.expanded() && this.activeIndex() >= 0 ? `${this.listId}-${this.activeIndex()}` : null,
  );

  constructor() {
    effect(() => {
      const id = this.config().id;
      untracked(() => {
        if (id !== this.#loadedFor) {
          this.close();
        }
      });
    });
  }

  protected toggle(): void {
    if (this.expanded()) {
      this.close();
    } else {
      this.#open();
    }
  }

  /** Ouvre le panneau, focalise le champ (après rendu, zoneless) et charge les suggestions. */
  #open(): void {
    this.query.set('');
    this.activeIndex.set(-1);
    this.expanded.set(true);
    afterNextRender(() => this.field()?.nativeElement.focus(), { injector: this.#injector });
    void this.#ensureLoaded(this.config());
  }

  protected close(): void {
    this.expanded.set(false);
    this.activeIndex.set(-1);
  }

  /** Escape : ferme le panneau et rend le focus au bouton. */
  protected onEscape(): void {
    if (!this.expanded()) {
      return;
    }
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  /** Ferme si le focus quitte le groupe bouton + panneau. */
  protected onFocusout(event: FocusEvent): void {
    const wrapper = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && !wrapper.contains(next)) {
      this.close();
    }
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(-1);
  }

  /** Flèches : surlignage ; Entrée : la suggestion surlignée, sinon la saisie telle quelle. */
  protected onFieldKeydown(event: KeyboardEvent): void {
    const options = this.filtered();
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() - 1 + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const highlighted = options[this.activeIndex()];
      const typed = this.query().trim();
      const model = highlighted ?? (typed || null);
      if (model !== null) {
        this.pick(model);
      }
    }
  }

  /** Choix d'un modèle : referme le panneau, rend le focus au bouton, émet. */
  protected pick(model: string): void {
    this.close();
    this.trigger()?.nativeElement.focus();
    this.picked.emit(model);
  }

  /** Sonde le provider une seule fois par configuration (clé enregistrée via `config_id`). */
  async #ensureLoaded(config: AiConfiguration): Promise<void> {
    if (!modelListingSupported(config.provider)) {
      this.options.set(null);
      this.failed.set(false);
      this.#loadedFor = config.id;
      return;
    }
    if (this.#loadedFor === config.id && (this.options() !== null || this.failed())) {
      return;
    }
    this.#loadedFor = config.id;
    this.options.set(null);
    this.failed.set(false);
    this.loading.set(true);
    try {
      const models = await this.#credentials.listModels({
        provider: config.provider,
        base_url: config.base_url,
        config_id: config.id,
      });
      if (this.#loadedFor === config.id) {
        this.options.set(models);
      }
    } catch {
      if (this.#loadedFor === config.id) {
        this.failed.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
