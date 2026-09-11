import { Injectable, InjectionToken, inject } from '@angular/core';
import { MODULE_LIBRARY_BASE, ModuleLibrary } from './module-libraries';

/**
 * Lecture du TEXTE d'un fichier de librairie (même origine que l'app, sans
 * Bearer : hors `apiUrl`). Token pour les specs — et pour que les pages qui
 * montent un module n'aient pas à fournir `HttpClient`. Une réponse HTML est
 * refusée : sous `ng serve`, un asset absent revient en page SPA (200), qui
 * inlinée dans un `<script>` casserait le module en silence.
 */
export const MODULE_LIBRARY_FETCH = new InjectionToken<(url: string) => Promise<string>>(
  'MODULE_LIBRARY_FETCH',
  {
    providedIn: 'root',
    factory: () => async (url: string) => {
      const response = await fetch(url);
      if (!response.ok || (response.headers.get('Content-Type') ?? '').includes('text/html')) {
        throw new Error(`Librairie de module indisponible : ${url} (HTTP ${response.status})`);
      }
      return response.text();
    },
  },
);

/** Texte d'une librairie, prêt à être inliné par `composeModuleDocument`. */
export interface ModuleLibrarySource {
  readonly name: string;
  readonly js: string;
  /** Feuille de style de la librairie (`''` si aucune). */
  readonly css: string;
}

/**
 * Cache mémoire des librairies du bac à sable, pour la session : la preview
 * de l'éditeur recompose le srcdoc à chaque frappe (debounce), une page peut
 * monter plusieurs modules — chaque fichier n'est lu qu'une fois. Un échec
 * sort du cache (un nouvel essai refait la requête).
 */
@Injectable({ providedIn: 'root' })
export class ModuleLibraryLoader {
  readonly #fetch = inject(MODULE_LIBRARY_FETCH);
  readonly #files = new Map<string, Promise<string>>();

  load(libraries: readonly ModuleLibrary[]): Promise<ModuleLibrarySource[]> {
    return Promise.all(
      libraries.map(async (library) => {
        const [js, css] = await Promise.all([
          this.#file(library.js),
          library.css ? this.#file(library.css) : Promise.resolve(''),
        ]);
        return { name: library.name, js, css };
      }),
    );
  }

  #file(name: string): Promise<string> {
    const cached = this.#files.get(name);
    if (cached) {
      return cached;
    }
    const text = this.#fetch(MODULE_LIBRARY_BASE + name);
    this.#files.set(name, text);
    text.catch(() => {
      if (this.#files.get(name) === text) {
        this.#files.delete(name);
      }
    });
    return text;
  }
}
