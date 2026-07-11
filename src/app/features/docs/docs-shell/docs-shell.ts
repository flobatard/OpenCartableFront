import { Component, effect, inject, signal, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { SeoService } from '../../../core/seo/seo.service';
import { MarkdownExtensionRegistry } from '../../../shared/markdown-extensions/markdown-extension-registry';
import { Spinner } from '../../../shared/spinner/spinner';
import { allDocPages, docPageBySlug } from '../doc-pages';

type DocsShellState = 'loading' | 'ready' | 'notFound' | 'error';

/**
 * Coquille des pages de documentation des langages markdown
 * (`/:lang/markdown-language/docs/:slug`, publique, RenderMode.Client) :
 * onglets de navigation (un lien router par langage — motif visuel `.tabs`,
 * PAS un tablist APG : ce sont de vraies navigations) et corps monté
 * dynamiquement via NgComponentOutlet (premier usage du projet).
 *
 * PREMIER composant du projet à survivre à un changement de param de chemin
 * (nav onglet→onglet réutilise l'instance) : le paramMap est OBSERVÉ via
 * `toSignal`, jamais lu en snapshot seul — un snapshot figerait la première page.
 */
@Component({
  selector: 'app-docs-shell',
  imports: [NgComponentOutlet, RouterLink, RouterLinkActive, Spinner, TranslocoPipe],
  templateUrl: './docs-shell.html',
  styleUrl: './docs-shell.scss',
})
export class DocsShell {
  readonly #route = inject(ActivatedRoute);
  readonly #seo = inject(SeoService);
  protected readonly language = inject(LanguageService);
  protected readonly pages = allDocPages(inject(MarkdownExtensionRegistry).defs);

  protected readonly slug = toSignal(
    this.#route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: this.#route.snapshot.paramMap.get('slug') ?? '' },
  );

  readonly #component = signal<Type<unknown> | null>(null);
  protected readonly component = this.#component.asReadonly();
  readonly #state = signal<DocsShellState>('loading');
  protected readonly state = this.#state.asReadonly();

  constructor() {
    // Charge le composant de doc du slug — import lazy sous stale-guard
    // (patron markdown-view) : un changement d'onglet pendant l'import
    // abandonne le montage périmé.
    effect((onCleanup) => {
      const page = docPageBySlug(this.pages, this.slug());
      if (page === undefined) {
        this.#state.set('notFound');
        this.#component.set(null);
        return;
      }
      let stale = false;
      onCleanup(() => (stale = true));
      this.#state.set('loading');
      page.loadComponent().then(
        (component) => {
          if (!stale) {
            this.#component.set(component);
            this.#state.set('ready');
          }
        },
        () => {
          if (!stale) {
            this.#state.set('error');
          }
        },
      );
    });

    // Titre/canonical de la page dans la langue active (faible enjeu SEO en
    // Client-only, mais gratuit via le service généralisé).
    effect(() => {
      const slug = this.slug();
      this.language.lang();
      if (docPageBySlug(this.pages, slug) === undefined) {
        return;
      }
      this.#seo.apply({
        titleKey: `docs.pages.${slug}.title`,
        descriptionKey: `docs.pages.${slug}.summary`,
        path: `markdown-language/docs/${slug}`,
      });
    });
  }
}
