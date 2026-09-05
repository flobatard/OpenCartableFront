import { Directive, ElementRef, inject, output } from '@angular/core';

/**
 * Navigation clavier d'un tablist APG : ←/→ cyclent entre les boutons
 * `role="tab"` de l'hôte (roving tabindex), déplacent le focus et émettent la
 * clé `data-tab` de l'onglet atteint — c'est l'hôte qui met à jour son état
 * (et donc `aria-selected`, relu ici pour connaître l'onglet courant).
 *
 * Usage : `<div role="tablist" ocTablist (tabChange)="onTabKey($event)">` avec
 * un `data-tab` par bouton. Les pages dont les onglets sont de vrais liens
 * (docs, cours élève) ne sont pas concernées.
 */
@Directive({
  selector: '[role="tablist"][ocTablist]',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class Tablist {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Clé (`data-tab`) de l'onglet atteint au clavier. */
  readonly tabChange = output<string>();

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    const tabs = Array.from(this.#host.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]'));
    if (tabs.length === 0) {
      return;
    }
    event.preventDefault();
    const current = Math.max(
      tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
      0,
    );
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(current + delta + tabs.length) % tabs.length];
    const key = next.dataset['tab'];
    if (key !== undefined) {
      this.tabChange.emit(key);
    }
    next.focus();
  }
}
