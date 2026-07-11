import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { parseGeogebraConfig } from './geogebra-config';

/** Origine d'embed figée en constante : seul l'id (validé) varie. */
const GEOGEBRA_EMBED_BASE = 'https://www.geogebra.org/material/iframe/id/';

/**
 * Rendu d'un fence ```geogebra : iframe vers l'activité publique geogebra.org.
 * Monté dynamiquement par `markdown-view` (contrat MarkdownExtensionComponent),
 * donc navigateur uniquement par construction. Chargé lazy (cf.
 * geogebra-extension.ts).
 */
@Component({
  selector: 'app-geogebra-view',
  imports: [TranslocoPipe],
  templateUrl: './geogebra-view.html',
  styleUrl: './geogebra-view.scss',
})
export class GeogebraView implements MarkdownExtensionComponent {
  readonly #sanitizer = inject(DomSanitizer);

  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  protected readonly config = computed(() => parseGeogebraConfig(this.source()));

  /**
   * SEUL bypass du composant, et il est étroit : le `[src]` d'une iframe est un
   * contexte resource-URL qu'Angular refuse sans bypass. L'URL est construite
   * sur une origine figée avec un id validé strictement alphanumérique
   * (parseGeogebraConfig) — id invalide → `null`, l'URL n'est jamais construite.
   */
  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const { id } = this.config();
    return id === null
      ? null
      : this.#sanitizer.bypassSecurityTrustResourceUrl(`${GEOGEBRA_EMBED_BASE}${id}`);
  });
}
