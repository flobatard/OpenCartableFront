import { isPlatformBrowser } from '@angular/common';
import { Component, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ModuleDetail } from '../../core/modules/module.model';
import { ModuleService } from '../../core/modules/module.service';
import { ModuleRunner } from './module-runner';

/**
 * Embed d'un module de la bibliothèque : résout `courseId`+`moduleId` en
 * code via `ModuleService.getModule` (cache partagé — un GET par module
 * affiché) puis délègue l'exécution sandbox à `ModuleRunner`. États : pas de
 * module choisi (bloc vide), module supprimé/injoignable (note « manquant »,
 * motif `.course-resource--missing`), résolu (iframe). Consommé par l'aperçu
 * d'un bloc `module` (éditeur + vue élève) et monté dynamiquement par
 * `markdown-view` sur les références `oc-module:` du markdown.
 *
 * L'hôte porte `data-oc-module-id` (survit au clonage) : c'est la clé de la
 * substitution « contenu interactif » à l'impression (print.service).
 * Client-only (résolution HTTP + iframe).
 */
@Component({
  selector: 'app-module-embed',
  imports: [TranslocoPipe, ModuleRunner],
  templateUrl: './module-embed.html',
  styleUrl: './module-embed.scss',
  host: {
    '[attr.data-oc-module-id]': 'moduleId()',
  },
})
export class ModuleEmbed {
  readonly #modules = inject(ModuleService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly courseId = input.required<string>();
  /** `null` = bloc module encore vide (aucun module choisi). */
  readonly moduleId = input<string | null>(null);

  protected readonly module = signal<ModuleDetail | null>(null);
  protected readonly state = signal<'empty' | 'loading' | 'missing' | 'ready'>('empty');

  constructor() {
    // Résolution avec stale-guard : seule la dernière paire (courseId,
    // moduleId) peut poser le résultat (le composant survit aux changements
    // d'inputs — montage dynamique markdown-view compris).
    effect((onCleanup) => {
      const courseId = this.courseId();
      const moduleId = this.moduleId();
      let stale = false;
      onCleanup(() => {
        stale = true;
      });
      if (!this.#isBrowser || !courseId || moduleId === null) {
        this.module.set(null);
        this.state.set('empty');
        return;
      }
      this.state.set('loading');
      this.#modules.getModule(courseId, moduleId).then(
        (module) => {
          if (!stale) {
            this.module.set(module);
            this.state.set('ready');
          }
        },
        () => {
          if (!stale) {
            this.module.set(null);
            this.state.set('missing');
          }
        },
      );
    });
  }
}
