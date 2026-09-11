import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Barre `.tabs` de liens de navigation (docs, cours élève) : quand elle défile
 * horizontalement (téléphone), l'onglet actif (`.tab--active`) est centré dans
 * la barre — au premier rendu puis à chaque changement d'onglet actif —, sinon
 * « Cours entier » ou la 12e page de doc s'ouvrent hors champ. Seul le
 * `scrollLeft` de la barre bouge (jamais `scrollIntoView`, qui ferait aussi
 * défiler la page).
 *
 * La classe active est observée (MutationObserver) plutôt que déduite du
 * routeur : `routerLinkActive` la pose après le rendu qui suit la navigation.
 *
 * Usage : `<nav class="tabs" ocActiveTabInView>`.
 */
@Directive({ selector: '[ocActiveTabInView]' })
export class ActiveTabInView {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  #revealed: HTMLElement | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Navigateur seulement (la page docs est rendue en SSR).
    afterNextRender(() => {
      const bar = this.#host.nativeElement;
      const observer = new MutationObserver(() => this.#reveal());
      observer.observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });
      destroyRef.onDestroy(() => observer.disconnect());
      this.#reveal();
    });
  }

  #reveal(): void {
    const bar = this.#host.nativeElement;
    const tab = bar.querySelector<HTMLElement>('.tab--active');
    // Une fois par onglet devenu actif : un défilement manuel n'est pas repris.
    if (!tab || tab === this.#revealed) {
      return;
    }
    this.#revealed = tab;
    if (bar.scrollWidth <= bar.clientWidth) {
      return;
    }
    const barRect = bar.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    bar.scrollLeft += tabRect.left + tabRect.width / 2 - (barRect.left + barRect.width / 2);
  }
}
