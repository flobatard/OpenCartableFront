import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  clampFrameHeight,
  composeModuleDocument,
  MODULE_FRAME_DEFAULT_HEIGHT,
  ModuleEventPayload,
  parseModuleMessage,
} from './module-document';
import { parseModuleLibraries } from './module-libraries';
import { ModuleLibraryLoader } from './module-library-loader';

/**
 * Exécuteur sandbox d'un module interactif : compose le document
 * (html/css/js + bridge, cf. `module-document.ts`) et le pose dans une
 * iframe à ORIGINE OPAQUE. Trois consommateurs : la preview live de
 * l'éditeur de module, l'aperçu d'un bloc `module` et l'embed `oc-module:`
 * du markdown (via `ModuleEmbed`).
 *
 * Invariants de sécurité — ne pas « simplifier » :
 * - `sandbox` est STATIQUE dans le template (jamais bindé) et ne contient
 *   jamais `allow-same-origin` : origine `'null'`, ni cookies, ni storage,
 *   ni DOM parent.
 * - le `srcdoc` est posé IMPÉRATIVEMENT dans un effect (jamais `[srcdoc]` :
 *   le sanitizer Angular striperait les scripts, et on n'ajoute pas de
 *   `bypassSecurityTrustHtml` hors markdown-view).
 * - les messages du pont sont validés par PROVENANCE (`event.source` =
 *   contentWindow de NOTRE iframe + `event.origin === 'null'`) et par forme
 *   (`parseModuleMessage`) ; la hauteur d'auto-resize est bornée.
 *
 * Librairies déclarées par le pragma `@oc-libs` : lues par le parent
 * (`ModuleLibraryLoader`) puis inlinées — composition alors ASYNCHRONE,
 * gardée par un compteur de génération (la preview live recompose à chaque
 * frappe : une lecture lente ne doit jamais écraser un code plus récent).
 * Sans pragma, le chemin reste synchrone. Échec de lecture : module composé
 * sans ses librairies, note sous l'iframe.
 *
 * Client-only par construction (l'iframe n'existe pas au SSR : `@if
 * isBrowser`).
 */
@Component({
  selector: 'app-module-runner',
  imports: [TranslocoPipe],
  templateUrl: './module-runner.html',
  styleUrl: './module-runner.scss',
})
export class ModuleRunner implements OnDestroy {
  readonly html = input<string>('');
  readonly css = input<string>('');
  readonly js = input<string>('');
  /** Titre accessible de l'iframe (repli i18n si vide). */
  readonly title = input<string>('');

  /** Événement applicatif émis par le module (`ocModule.emit(name, data)`). */
  readonly moduleEvent = output<ModuleEventPayload>();

  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  protected readonly frameHeight = signal(MODULE_FRAME_DEFAULT_HEIGHT);
  /** Une librairie déclarée n'a pas pu être lue (module composé sans elle). */
  protected readonly libraryError = signal(false);

  readonly #loader = inject(ModuleLibraryLoader);
  /** Incrémenté à chaque composition et au destroy : invalide les lectures en vol. */
  #generation = 0;

  /** Référence stable pour add/removeEventListener. */
  readonly #onMessage = (event: MessageEvent): void => {
    const iframe = this.frame()?.nativeElement;
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== 'null') {
      return;
    }
    const message = parseModuleMessage(event.data);
    if (message === null) {
      return;
    }
    if (message.type === 'resize') {
      this.frameHeight.set(clampFrameHeight(message.height));
    } else {
      this.moduleEvent.emit({ name: message.name, data: message.data });
    }
  };

  constructor() {
    if (this.isBrowser) {
      window.addEventListener('message', this.#onMessage);
    }
    // Recompose le srcdoc à chaque changement de code (et au montage de
    // l'iframe : `frame()` est trackée). Poser srcdoc recharge l'iframe ;
    // la hauteur courante est conservée jusqu'au prochain resize du bridge
    // (pas de saut visuel pendant la frappe en preview live).
    effect(() => {
      const [html, css, js] = [this.html(), this.css(), this.js()];
      const iframe = this.frame()?.nativeElement;
      if (!iframe) {
        return;
      }
      const generation = ++this.#generation;
      const { libraries } = parseModuleLibraries(js);
      if (libraries.length === 0) {
        this.libraryError.set(false);
        iframe.srcdoc = composeModuleDocument(html, css, js);
        return;
      }
      this.#loader.load(libraries).then(
        (sources) => {
          if (generation === this.#generation) {
            this.libraryError.set(false);
            iframe.srcdoc = composeModuleDocument(html, css, js, sources);
          }
        },
        () => {
          if (generation === this.#generation) {
            this.libraryError.set(true);
            iframe.srcdoc = composeModuleDocument(html, css, js);
          }
        },
      );
    });
  }

  ngOnDestroy(): void {
    this.#generation++;
    if (this.isBrowser) {
      window.removeEventListener('message', this.#onMessage);
    }
  }
}
