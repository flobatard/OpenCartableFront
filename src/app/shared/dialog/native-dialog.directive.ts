import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Élément `<dialog>` natif piloté par son composant hôte : `open()` / `close()`
 * délèguent à `showModal()` / `close()` — focus-trap, Escape et backdrop sont
 * gérés par la plateforme — et un clic sur le fond ferme (le backdrop d'un
 * `<dialog>` cible l'élément lui-même).
 *
 * Usage : `<dialog ocDialog …>` et, côté composant,
 * `protected readonly dialog = viewChild(NativeDialog)` puis
 * `this.dialog()?.open()`. Les specs stubbent `showModal`/`close` sur
 * l'élément natif (jsdom n'implémente pas la modalité).
 */
@Directive({
  selector: 'dialog[ocDialog]',
  host: { '(click)': 'onBackdropClick($event)' },
})
export class NativeDialog {
  readonly #element = inject<ElementRef<HTMLDialogElement>>(ElementRef);

  open(): void {
    this.#element.nativeElement.showModal();
  }

  close(): void {
    this.#element.nativeElement.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.#element.nativeElement) {
      this.close();
    }
  }
}
