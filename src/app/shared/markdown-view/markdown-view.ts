import {
  afterRenderEffect,
  ApplicationRef,
  Component,
  ComponentRef,
  createComponent,
  effect,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injector,
  input,
  PLATFORM_ID,
  signal,
  Type,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { hasCourseDiagrams, renderCourseDiagrams } from '../../core/markdown/course-diagrams';
import { renderCourseMarkdown } from '../../core/markdown/course-markdown';
import { isModuleId, MODULE_REF_ATTR } from '../../core/markdown/course-module-ref';
import { resourceKind } from '../../core/markdown/course-resource-ref';
import {
  hasCourseResources,
  ResolvedResource,
  resolveCourseResources,
} from '../../core/markdown/course-resource-pass';
import { PrintService } from '../../core/print/print.service';
import {
  applyExtensionPlaceholders,
  EXTENSION_ATTR,
  hasMarkdownExtensions,
} from '../markdown-extensions/extension-placeholders';
import { MarkdownExtensionRegistry } from '../markdown-extensions/markdown-extension-registry';
import { COURSE_RESOURCE_RESOLVER } from '../../core/course-content/course-content-resolvers';
import { CourseResource } from '../../core/resources/resource.model';
import { CourseStyleService } from '../../core/courses/course-style.service';
import { ThemeService } from '../../core/theme/theme.service';
import { CourseStyleDialog } from '../course-style-dialog/course-style-dialog';

/**
 * Vue de rendu markdown de cours (présentational, lecture seule) : prend une
 * chaîne markdown en entrée et l'affiche en HTML sûr via le pipeline de
 * `core/markdown/` — markdown + KaTeX synchrone, puis passes asynchrones
 * Mermaid et ressources. Consommée par `markdown-field`, l'aperçu d'exercice,
 * `course-preview`, le chat de l'assistant et les pages élèves.
 *
 * Avec un `courseId`, la passe ressources résout les `oc-resource:<id>` en
 * média/lien via l'URL présignée fraîche du résolveur injecté
 * (`COURSE_RESOURCE_RESOLVER` : bibliothèque prof par défaut, endpoints
 * publics sur les routes élèves) — la bibliothèque est normalement chargée par
 * la page hôte ; un chargement défensif (`ensureList`) comble le cas
 * contraire. Les fences d'extension (```geogebra…) et les placeholders de
 * module (`oc-module:`) sont montés en composants sur le HTML rendu.
 *
 * Rend dès qu'il est **monté** (le montage est gouverné par le `@if` de la
 * page hôte). Seule la garde navigateur subsiste — DOMPurify/Mermaid touchent
 * `window`, la page hôte doit être en `RenderMode.Client`.
 */
@Component({
  selector: 'app-markdown-view',
  imports: [TranslocoPipe, CourseStyleDialog],
  templateUrl: './markdown-view.html',
  styleUrl: './markdown-view.scss',
})
export class MarkdownView {
  readonly #sanitizer = inject(DomSanitizer);
  readonly #theme = inject(ThemeService);
  readonly #transloco = inject(TranslocoService);
  readonly #resources = inject(COURSE_RESOURCE_RESOLVER);
  readonly #print = inject(PrintService);
  /** Réglages de style du cours courant — exposés au template (binding `[style]`). */
  protected readonly courseStyle = inject(CourseStyleService);
  readonly #extensions = inject(MarkdownExtensionRegistry);
  readonly #envInjector = inject(EnvironmentInjector);
  readonly #injector = inject(Injector);
  readonly #appRef = inject(ApplicationRef);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Exposé au template : le bouton d'impression n'a de sens qu'au navigateur. */
  protected readonly isBrowser = this.#isBrowser;

  /** Conteneur du HTML rendu — source de l'export PDF. */
  protected readonly contentEl = viewChild<ElementRef<HTMLElement>>('content');

  /** Markdown à rendre (frappe en cours ou contenu d'un bloc). */
  readonly markdown = input.required<string>();

  /**
   * Cours propriétaire des ressources référencées. `null` (défaut) : les
   * `oc-resource:` ne sont pas résolus (composant hors contexte cours).
   */
  readonly courseId = input<string | null>(null);

  /**
   * Affiche le bouton d'impression flottant (défaut). Les hôtes qui rendent
   * beaucoup de petits extraits (pages de doc, playground) le masquent.
   */
  readonly showPrint = input<boolean>(true);

  /**
   * Affiche le bouton « style de lecture » flottant (défaut). N'apparaît de
   * toute façon qu'en contexte cours (`courseId` non nul) ; l'aperçu global le
   * masque (son bouton général de barre suffit — le réglage est unique au cours).
   */
  readonly showSettings = input<boolean>(true);

  /** Modale de style, montée en contexte cours (cf. `showSettings`). */
  protected readonly styleDialog = viewChild(CourseStyleDialog);

  /** Cours pour lequel un chargement défensif de la biblio a déjà été tenté. */
  #loadedCourseId: string | null = null;

  /**
   * HTML rendu (markdown + KaTeX, puis diagrammes Mermaid, puis ressources). La
   * sanitisation vit dans core/markdown (DOMPurify) ; le bypass évite
   * uniquement le second nettoyage d'Angular, qui dépouillerait les attributs
   * style et le MathML/SVG dont dépendent KaTeX et Mermaid. Signal (et non
   * computed) car les passes Mermaid/ressources sont asynchrones.
   */
  readonly #html = signal<SafeHtml>(this.#sanitizer.bypassSecurityTrustHtml(''));
  protected readonly html = this.#html.asReadonly();

  /**
   * Clé (thème|cours|markdown) du dernier rendu dont la passe ressources a
   * ABOUTI : pour un contenu identique, l'effet de rendu sort avant toute
   * écriture et sans relire `list()`/`listLoading()` — il se désabonne de la
   * bibliothèque. Sans ce gel, chaque `loadList()` d'une page hôte traversée
   * (navigation page cours ⇄ éditeurs) rejouerait le rendu de TOUTES les vues
   * à ressources encore montées — dont chaque message du panneau assistant
   * persistant : flash du HTML de base non résolu, re-présignature de chaque
   * URL, et saut de scroll du fil. Contrepartie assumée : une ressource
   * devenue disponible/renommée APRÈS un rendu résolu n'actualise pas ce
   * rendu tant que son markdown, le thème ou le cours ne changent pas.
   */
  #resolvedResourcesKey: string | null = null;

  /** Import mémoïsé de ModuleEmbed (iframe sandbox hors des chunks sans module). */
  #moduleEmbedImport: Promise<Type<unknown>> | null = null;

  constructor() {
    // Chargement défensif de la bibliothèque : seulement si aucun hôte ne l'a
    // chargée pour ce cours (liste vide et pas en cours) — sinon on écraserait
    // la liste déjà présente. `untracked` : ne réagit qu'au changement de cours.
    effect(() => {
      const courseId = this.courseId();
      if (!this.#isBrowser || courseId === null || this.#loadedCourseId === courseId) {
        return;
      }
      this.#loadedCourseId = courseId;
      untracked(() => this.#resources.ensureList(courseId));
    });

    // Rendu markdown+KaTeX synchrone (chemin rapide), puis passes asynchrones
    // Mermaid et ressources. Gardé sur le navigateur. Re-rendu quand le
    // markdown ou le thème change — et à l'arrivée de la bibliothèque tant
    // que la passe ressources n'a pas abouti (gel ensuite).
    effect((onCleanup) => {
      if (!this.#isBrowser) {
        return;
      }
      const theme = this.#theme.theme();
      const courseId = this.courseId();
      const markdown = this.markdown();
      // Gel du rendu résolu (cf. #resolvedResourcesKey) : sortir AVANT la
      // lecture de la bibliothèque — l'effet ne re-suivra list()/listLoading()
      // que si le contenu change réellement.
      const key = `${theme}|${courseId}|${markdown}`;
      if (this.#resolvedResourcesKey === key) {
        return;
      }
      this.#resolvedResourcesKey = null;
      // Passe extensions synchrone : les fences des langages enregistrés
      // (```geogebra…) deviennent des hôtes `data-oc-extension`, montés en
      // composants par l'afterRenderEffect ci-dessous une fois le HTML au DOM.
      let base = renderCourseMarkdown(markdown);
      if (hasMarkdownExtensions(base, this.#extensions.defs)) {
        base = applyExtensionPlaceholders(base, this.#extensions.defs);
      }
      this.#html.set(this.#sanitizer.bypassSecurityTrustHtml(base));

      const needsDiagrams = hasCourseDiagrams(base);
      const hasResources = courseId !== null && hasCourseResources(base);
      // Lecture réactive : le rendu se rejoue à l'arrivée de la bibliothèque. On
      // ne résout qu'une fois le chargement terminé — évite un flash « indisponible ».
      const list = hasResources ? this.#resources.list() : EMPTY_RESOURCES;
      const resolveResources = hasResources && !this.#resources.listLoading();
      if (!needsDiagrams && !resolveResources) {
        return;
      }

      // Changement de markdown/thème/liste pendant le rendu async : passe périmée ignorée.
      let stale = false;
      onCleanup(() => (stale = true));
      void this.#renderAsync(base, theme, needsDiagrams, resolveResources, courseId, list).then(
        (enhanced) => {
          if (!stale) {
            this.#html.set(this.#sanitizer.bypassSecurityTrustHtml(enhanced));
            if (resolveResources) {
              this.#resolvedResourcesKey = key;
            }
          }
        },
      );
    });

    // Montage des extensions markdown et des embeds de module : APRÈS que la
    // change detection a appliqué `[innerHTML]` au DOM (afterRenderEffect), et
    // re-monté après CHAQUE nouvelle valeur de `html()` (chaque set réécrit
    // l'innerHTML et souffle les hôtes précédents). Le onCleanup — exécuté
    // avant chaque ré-exécution et à la destruction — invalide le montage en
    // vol et détruit les ComponentRef du cycle précédent (sinon fuite de vues
    // attachées).
    afterRenderEffect((onCleanup) => {
      this.html();
      const host = this.contentEl()?.nativeElement;
      if (!this.#isBrowser || host === undefined) {
        return;
      }
      let stale = false;
      const refs: ComponentRef<unknown>[] = [];
      onCleanup(() => {
        stale = true;
        for (const ref of refs) {
          ref.destroy();
        }
      });
      // Extensions : un composant par fence enregistré, importé lazy par le
      // registry ; import échoué ou langage désenregistré = source visible.
      void this.#mountOnPlaceholders(host, `[${EXTENSION_ATTR}]`, refs, () => stale, {
        load: (el) => {
          const language = el.getAttribute(EXTENSION_ATTR) ?? '';
          return this.#extensions.get(language) === undefined
            ? null
            : this.#extensions.load(language);
        },
        inputs: (el) => ({ source: el.textContent ?? '' }),
        pendingClass: 'course-extension--pending',
      });
      // Embeds de module : hors contexte cours, les spans restent des notes
      // inertes. Garde de forme (UUID) : un `data-oc-module-id` peut aussi
      // arriver par du HTML brut (DOMPurify garde les data-*) sans passer par
      // parseModuleRef — un id forgé n'atteint jamais l'URL de l'API.
      const courseId = this.courseId();
      if (courseId !== null) {
        void this.#mountOnPlaceholders(host, `[${MODULE_REF_ATTR}]`, refs, () => stale, {
          load: (el) =>
            isModuleId(el.getAttribute(MODULE_REF_ATTR) ?? '') ? this.#moduleEmbed() : null,
          inputs: (el) => ({ courseId, moduleId: el.getAttribute(MODULE_REF_ATTR) ?? '' }),
          pendingClass: 'course-module-embed--pending',
        });
      }
    });
  }

  /**
   * Monte un composant sur chaque hôte `selector` du HTML rendu. `load` rend
   * la promesse du composant (ou `null` : l'hôte reste inerte), `inputs` ses
   * entrées — lues AVANT le vidage de l'hôte (la source d'un fence est son
   * textContent). `createComponent({ hostElement })` plutôt qu'un
   * ViewContainerRef : le placeholder vit dans du `[innerHTML]`, hors template
   * — il devient l'hôte (ses `data-*` restent, l'export PDF les retrouve) ;
   * `attachView` inscrit la vue dans le tick zoneless. Le textContent n'est
   * vidé qu'après un import réussi (la source reste le repli) et le
   * modificateur pending retiré avec lui ; stale-check après chaque `await`.
   */
  async #mountOnPlaceholders(
    host: HTMLElement,
    selector: string,
    refs: ComponentRef<unknown>[],
    isStale: () => boolean,
    mount: {
      load: (el: HTMLElement) => Promise<Type<unknown>> | null;
      inputs: (el: HTMLElement) => Record<string, unknown>;
      pendingClass: string;
    },
  ): Promise<void> {
    for (const el of host.querySelectorAll<HTMLElement>(selector)) {
      const pending = mount.load(el);
      if (pending === null) {
        continue;
      }
      const inputs = mount.inputs(el);
      let component: Type<unknown>;
      try {
        component = await pending;
      } catch {
        continue;
      }
      if (isStale()) {
        return;
      }
      el.textContent = '';
      el.classList.remove(mount.pendingClass);
      const ref = createComponent(component, {
        environmentInjector: this.#envInjector,
        elementInjector: this.#injector,
        hostElement: el,
      });
      for (const [name, value] of Object.entries(inputs)) {
        ref.setInput(name, value);
      }
      this.#appRef.attachView(ref.hostView);
      refs.push(ref);
    }
  }

  /** Import mémoïsé de `ModuleEmbed` ; un échec est retiré du cache (retry possible). */
  #moduleEmbed(): Promise<Type<unknown>> {
    this.#moduleEmbedImport ??= import('../module-runner/module-embed')
      .then((m) => m.ModuleEmbed)
      .catch((error: unknown) => {
        this.#moduleEmbedImport = null;
        throw error;
      });
    return this.#moduleEmbedImport;
  }

  /** Enchaîne les passes async (diagrammes puis ressources) sur le HTML de base. */
  async #renderAsync(
    base: string,
    theme: 'light' | 'dark',
    needsDiagrams: boolean,
    resolveResources: boolean,
    courseId: string | null,
    list: readonly CourseResource[],
  ): Promise<string> {
    let html = base;
    if (needsDiagrams) {
      const mathNote = this.#transloco.translate('markdownField.mermaidMathNote');
      const errorLabel = this.#transloco.translate('markdownField.mermaidError');
      html = await renderCourseDiagrams(html, theme, mathNote, errorLabel);
    }
    if (resolveResources && courseId !== null) {
      const missing = this.#transloco.translate('markdownField.resourceMissing');
      html = await resolveCourseResources(
        html,
        (id) => this.#resolveResource(courseId, list, id),
        missing,
      );
    }
    return html;
  }

  /** Résout un id de ressource en URL présignée + type de rendu, ou `null`. */
  async #resolveResource(
    courseId: string,
    list: readonly CourseResource[],
    id: string,
  ): Promise<ResolvedResource | null> {
    const resource = list.find((r) => r.id === id);
    if (!resource || resource.status !== 'available') {
      return null;
    }
    const url = await this.#resources.getDownloadUrl(courseId, id);
    return { url, kind: resourceKind(resource.type), label: resource.original_name };
  }

  /**
   * Exporte le contenu rendu en PDF (impression navigateur). Hook réutilisable
   * pour les hôtes qui veulent un bouton d'export ; no-op au SSR ou avant le
   * montage du contenu.
   */
  async print(): Promise<void> {
    const el = this.contentEl()?.nativeElement;
    if (!this.#isBrowser || !el) {
      return;
    }
    // Les liens du PDF pointent l'URL stable du régime courant (prof ou élève).
    await this.#print.printCourseContent(el, this.courseId(), (lang, courseId, resourceId) =>
      this.#resources.contentUrl(lang, courseId, resourceId),
    );
  }

  /** Ouvre la modale de réglage du style de lecture du cours. */
  protected openStyle(): void {
    this.styleDialog()?.open();
  }
}

/** Liste vide stable (évite d'abonner l'effet à `list` quand inutile). */
const EMPTY_RESOURCES: readonly CourseResource[] = [];
