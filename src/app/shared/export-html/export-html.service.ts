import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { downloadBlob, titleSlug } from '../../core/courses/course-transfer.utils';
import { AppLang, LanguageService } from '../../core/i18n/language.service';
import { MODULE_REF_ATTR, isModuleId } from '../../core/markdown/course-module-ref';
import { RESOURCE_REF_ATTR } from '../../core/markdown/course-resource-ref';
import { ModuleDetail } from '../../core/modules/module.model';
import { courseContentUrl, resourceContentUrl } from '../../core/resources/resource.utils';
import { environment } from '../../../environments/environment';
import { composeModuleAsync } from '../module-runner/compose-module';
import { MODULE_FRAME_DEFAULT_HEIGHT } from '../module-runner/module-document';
import { ModuleLibraryLoader } from '../module-runner/module-library-loader';
import { buildMediaNote, ResourceUrlBuilder } from '../print/print-transform';
import { collectExportStyles, needsMathFonts } from './export-styles';
import { ExportLabels, transformForExport } from './export-transform';
import { buildStandaloneDocument, EXPORT_MODULE_FRAME_ATTR } from './standalone-document';

export { EXPORT_STRIPPED_SELECTORS, transformForExport } from './export-transform';
export { collectExportStyles, needsMathFonts } from './export-styles';
export { buildStandaloneDocument } from './standalone-document';

/**
 * Lecture d'un binaire à embarquer (image d'une ressource, police KaTeX).
 * Token pour les specs — et parce que ces requêtes ne passent ni par
 * `HttpClient` ni par l'intercepteur OIDC : les URL présignées S3 sont hors
 * `apiUrl` (aucun Bearer à y envoyer) et les polices sont des assets.
 */
export const EXPORT_FETCH = new InjectionToken<(url: string) => Promise<Blob>>('EXPORT_FETCH', {
  providedIn: 'root',
  factory: () => async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Contenu indisponible pour l'export : ${url} (HTTP ${response.status})`);
    }
    return response.blob();
  },
});

/**
 * Budget total des binaires embarqués (images). Au-delà, les images restantes
 * retombent sur une note + lien stable : un cours richement illustré ne doit
 * pas produire un fichier que le navigateur de l'élève n'ouvrira pas.
 */
export const EXPORT_MAX_INLINE_BYTES = 25 * 1024 * 1024;

/** Ce que l'export a dû dégrader — de quoi informer honnêtement l'utilisateur. */
export interface ExportReport {
  /** Images intégrées en `data:`. */
  inlinedImages: number;
  /** Images laissées en lien (échec de lecture, ou budget épuisé). */
  skippedImages: number;
  /** Modules embarqués vivants. */
  embeddedModules: number;
  /** Modules remplacés par une note (option décochée, ou code injoignable). */
  skippedModules: number;
  /** Taille du fichier produit, en octets. */
  bytes: number;
}

export interface CourseExportOptions {
  /** `null` hors contexte cours : ni URL stable, ni module à résoudre. */
  courseId: string | null;
  /** Titre du cours ou du bloc : `<title>` et nom de fichier. */
  title: string;
  /**
   * Construit l'URL front stable d'une ressource — défaut : la route prof
   * protégée. Les pages élèves passent le builder de leur régime public
   * (même contrat que `PrintService`).
   */
  resourceUrl?: ResourceUrlBuilder;
  /**
   * Résolution du code d'un module. **Passée par l'appelant**, jamais
   * injectée ici : `COURSE_MODULE_RESOLVER` est fourni au niveau des routes
   * publiques, un service root recevrait toujours l'implémentation prof et
   * enverrait un Bearer depuis une page élève.
   */
  getModule?: (courseId: string, moduleId: string) => Promise<ModuleDetail>;
  /** Embarquer les modules vivants (défaut) ou les remplacer par une note. */
  includeModules?: boolean;
  /**
   * Titre affiché en tête du fichier. À poser pour un cours entier (l'en-tête
   * de la page vit hors du clone), à laisser vide pour un bloc seul.
   */
  heading?: string;
}

/**
 * Export d'un contenu de cours en **page HTML autonome** : un fichier unique,
 * ouvrable hors ligne, qui garde les modules interactifs vivants.
 *
 * Frère de `PrintService` : même principe — cloner le DOM déjà rendu (donc
 * déjà sanitisé par `core/markdown/`), le transformer, puis produire le
 * livrable — mais on sérialise au lieu d'imprimer. Trois consommateurs, les
 * mêmes qu'au PDF : `markdown-view` (un bloc), `course-preview` (prof) et
 * `student-content` (élève).
 *
 * Quatre passes après la transformation synchrone (`export-transform.ts`) :
 * modules embarqués en iframe `srcdoc` (`composeModuleAsync`, CSP du bac à
 * sable inchangée), images intégrées en `data:` sous un budget, CSS collecté
 * depuis le CSSOM vivant (`export-styles.ts`), assemblage
 * (`standalone-document.ts`).
 *
 * Navigateur uniquement : no-op au SSR.
 */
@Injectable({ providedIn: 'root' })
export class ExportHtmlService {
  readonly #transloco = inject(TranslocoService);
  readonly #language = inject(LanguageService);
  readonly #libraries = inject(ModuleLibraryLoader);
  readonly #fetch = inject(EXPORT_FETCH);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Clone `source`, produit la page autonome et déclenche son téléchargement. */
  async exportCourseContent(
    source: HTMLElement,
    options: CourseExportOptions,
  ): Promise<ExportReport | null> {
    if (!this.#isBrowser) {
      return null;
    }
    const lang = this.#language.lang();
    const resourceUrl = options.resourceUrl ?? resourceContentUrl;
    const labels: ExportLabels = {
      mediaNote: this.#transloco.translate('courses.preview.pdfMediaNote'),
      interactiveFallback: this.#transloco.translate('markdownExtensions.printFallback'),
      moduleFallback: this.#transloco.translate('moduleEmbed.printFallback'),
    };

    const clone = source.cloneNode(true) as HTMLElement;
    transformForExport(clone, options.courseId, lang, labels, resourceUrl, environment.siteUrl);

    const modules = await this.#embedModules(clone, options, lang, labels);
    const images = await this.#inlineImages(clone, options.courseId, lang, labels, resourceUrl);

    const styles = await collectExportStyles(document, {
      inlineMathFonts: needsMathFonts(clone),
      toDataUrl: (url) => this.#toDataUrl(url).then((result) => result?.dataUrl ?? null),
    });

    const html = buildStandaloneDocument({
      title: options.title,
      heading: options.heading,
      lang,
      styles,
      body: clone.outerHTML,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `course-${titleSlug(options.title)}.html`);

    return { ...modules, ...images, bytes: blob.size };
  }

  /**
   * Remplace chaque hôte de module par une iframe `srcdoc` autonome : mêmes
   * `sandbox` (jamais `allow-same-origin`) et même CSP que dans l'app, code et
   * librairies `@oc-libs` inlinés. C'est la seule interactivité qui survit au
   * fichier — un module ne fait par construction aucune requête réseau.
   */
  async #embedModules(
    root: HTMLElement,
    options: CourseExportOptions,
    lang: AppLang,
    labels: ExportLabels,
  ): Promise<Pick<ExportReport, 'embeddedModules' | 'skippedModules'>> {
    const doc = root.ownerDocument;
    const courseUrl =
      options.courseId === null ? null : courseContentUrl(lang, options.courseId);
    let embeddedModules = 0;
    let skippedModules = 0;

    for (const host of [...root.querySelectorAll(`[${MODULE_REF_ATTR}]`)]) {
      const moduleId = host.getAttribute(MODULE_REF_ATTR) ?? '';
      const code =
        options.includeModules !== false && options.courseId && isModuleId(moduleId)
          ? await this.#loadModule(options, moduleId)
          : null;
      if (code === null) {
        skippedModules++;
        host.replaceWith(
          buildMediaNote(doc, labels.moduleFallback, '', courseUrl, 'oc-print__extension-note'),
        );
        continue;
      }
      const { doc: srcdoc } = await composeModuleAsync(
        this.#libraries,
        code.html,
        code.css,
        code.js,
      );
      host.replaceWith(this.#buildModuleFrame(doc, srcdoc, code.title));
      embeddedModules++;
    }
    return { embeddedModules, skippedModules };
  }

  async #loadModule(options: CourseExportOptions, moduleId: string): Promise<ModuleDetail | null> {
    if (!options.getModule || options.courseId === null) {
      return null;
    }
    try {
      return await options.getModule(options.courseId, moduleId);
    } catch {
      return null; // Module supprimé ou injoignable : note, comme au PDF.
    }
  }

  #buildModuleFrame(doc: Document, srcdoc: string, title: string): HTMLIFrameElement {
    const frame = doc.createElement('iframe');
    // `sandbox` littéral, comme dans `module-runner.html` : jamais
    // `allow-same-origin`, l'origine du module reste opaque.
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute(EXPORT_MODULE_FRAME_ATTR, '');
    frame.setAttribute('title', title || this.#transloco.translate('moduleEmbed.badge'));
    frame.setAttribute(
      'style',
      `display: block; width: 100%; height: ${MODULE_FRAME_DEFAULT_HEIGHT}px; border: 0;`,
    );
    // Propriété, jamais un attribut posé à la main : le sérialiseur échappe
    // guillemets et chevrons du document composé.
    frame.srcdoc = srcdoc;
    return frame;
  }

  /**
   * Intègre les images en `data:` dans l'ordre du DOM, sous un budget global.
   * Une image de ressource qui ne peut pas être lue — budget épuisé, ou plus
   * souvent un bucket S3 dont le CORS n'autorise pas le `GET` depuis l'origine
   * du front — retombe sur la note + lien stable du PDF plutôt que sur une URL
   * présignée qui aura expiré.
   */
  async #inlineImages(
    root: HTMLElement,
    courseId: string | null,
    lang: AppLang,
    labels: ExportLabels,
    resourceUrl: ResourceUrlBuilder,
  ): Promise<Pick<ExportReport, 'inlinedImages' | 'skippedImages'>> {
    const doc = root.ownerDocument;
    let used = 0;
    let inlinedImages = 0;
    let skippedImages = 0;

    for (const img of [...root.querySelectorAll('img')]) {
      const src = img.getAttribute('src') ?? '';
      if (src === '' || src.startsWith('data:')) {
        continue;
      }
      const read =
        used < EXPORT_MAX_INLINE_BYTES ? await this.#toDataUrl(src) : null;
      if (read !== null && used + read.size <= EXPORT_MAX_INLINE_BYTES) {
        img.setAttribute('src', read.dataUrl);
        img.removeAttribute('srcset');
        img.removeAttribute('loading');
        used += read.size;
        inlinedImages++;
        continue;
      }
      skippedImages++;
      const resourceId = img.getAttribute(RESOURCE_REF_ATTR);
      if (courseId === null || resourceId === null) {
        continue; // Image hors bibliothèque : on garde son URL telle quelle.
      }
      img.replaceWith(
        buildMediaNote(
          doc,
          labels.mediaNote,
          img.getAttribute('alt') ?? '',
          resourceUrl(lang, courseId, resourceId),
        ),
      );
    }
    return { inlinedImages, skippedImages };
  }

  /** Lit une URL et la rend en `data:` URI ; `null` si elle est illisible. */
  async #toDataUrl(url: string): Promise<{ dataUrl: string; size: number } | null> {
    try {
      const blob = await this.#fetch(url);
      const dataUrl = await blobToDataUrl(blob);
      return { dataUrl, size: blob.size };
    } catch {
      return null;
    }
  }
}

/** `FileReader` plutôt qu'un encodage maison : base64 natif, sans copie en mémoire JS. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.readAsDataURL(blob);
  });
}
