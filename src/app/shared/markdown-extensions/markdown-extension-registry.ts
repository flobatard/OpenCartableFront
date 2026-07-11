import { inject, Injectable, Type } from '@angular/core';
import {
  MARKDOWN_EXTENSIONS,
  MarkdownExtensionComponent,
  MarkdownExtensionDef,
} from './markdown-extension.model';

/**
 * Registry des langages d'extension markdown : indexe les defs enregistrées
 * (multi-provider `MARKDOWN_EXTENSIONS`) et mémoïse l'import dynamique de
 * chaque composant — une promesse par langage, partagée entre tous les
 * montages (la fenêtre de staleness d'un montage se réduit au premier import).
 */
@Injectable({ providedIn: 'root' })
export class MarkdownExtensionRegistry {
  /** Defs enregistrées — passées telles quelles à la passe placeholder pure. */
  readonly defs: readonly MarkdownExtensionDef[] =
    inject(MARKDOWN_EXTENSIONS, { optional: true }) ?? [];

  readonly #byLanguage = new Map(this.defs.map((def) => [def.language, def]));
  readonly #loads = new Map<string, Promise<Type<MarkdownExtensionComponent>>>();

  /** Def d'un langage, ou `undefined` s'il n'est pas enregistré. */
  get(language: string): MarkdownExtensionDef | undefined {
    return this.#byLanguage.get(language);
  }

  /**
   * Import mémoïsé du composant d'un langage. Rejette si le langage est
   * inconnu ou si l'import échoue — un import échoué est retiré du cache pour
   * permettre une retentative (ex. réseau revenu).
   */
  load(language: string): Promise<Type<MarkdownExtensionComponent>> {
    const cached = this.#loads.get(language);
    if (cached !== undefined) {
      return cached;
    }
    const def = this.#byLanguage.get(language);
    if (def === undefined) {
      return Promise.reject(new Error(`Unknown markdown extension: ${language}`));
    }
    const loading = def.loadComponent().catch((err: unknown) => {
      this.#loads.delete(language);
      throw err;
    });
    this.#loads.set(language, loading);
    return loading;
  }
}
