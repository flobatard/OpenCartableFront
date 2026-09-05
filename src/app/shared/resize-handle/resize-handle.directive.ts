import { Directive, ElementRef, inject, input, model, output } from '@angular/core';

/**
 * Poignée de redimensionnement (separator WAI-ARIA) entre deux colonnes d'un
 * conteneur flex : le pourcentage de la première colonne est un `model` que
 * l'hôte bind en `[(value)]` sur son signal (et applique via une custom
 * property, jamais un `flex-basis` inline).
 *
 * - glissé : pointeur **capturé** sur la poignée (Monaco ne vole pas les
 *   événements pendant le drag), axe dérivé du `flex-direction` réel du
 *   conteneur — `row` → X, `column` (empilé sur mobile) → Y ;
 * - clavier : flèches ± `step`, Début/Fin aux bornes ;
 * - `dragging` prévient l'hôte (il neutralise la sélection de texte).
 *
 * Usage : `<div ocResizeHandle=".ma-grille" [(value)]="editorPct" (dragging)="dragging.set($event)">`
 * ; `role`, `tabindex` et les `aria-value*` sont posés ici, l'hôte ajoute
 * `aria-orientation` et `aria-label`.
 */
@Directive({
  selector: '[ocResizeHandle]',
  host: {
    role: 'separator',
    tabindex: '0',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-valuemin]': 'min()',
    '[attr.aria-valuemax]': 'max()',
    '(pointerdown)': 'startDrag($event)',
    '(keydown)': 'onKeydown($event)',
  },
})
export class ResizeHandle {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Sélecteur (`closest`) du conteneur flex dont la première colonne est redimensionnée. */
  readonly container = input.required<string>({ alias: 'ocResizeHandle' });
  /** Pourcentage de la première colonne. */
  readonly value = model.required<number>();
  readonly min = input(15);
  readonly max = input(85);
  readonly step = input(2);
  readonly dragging = output<boolean>();

  #clamp(value: number): number {
    return Math.min(this.max(), Math.max(this.min(), value));
  }

  protected startDrag(event: PointerEvent): void {
    event.preventDefault();
    const divider = this.#host.nativeElement;
    const container = divider.closest(this.container()) as HTMLElement | null;
    if (!container) {
      return;
    }
    const isVertical = getComputedStyle(container).flexDirection === 'column';
    this.dragging.emit(true);
    divider.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent): void => {
      const rect = container.getBoundingClientRect();
      const pct = isVertical
        ? ((e.clientY - rect.top) / rect.height) * 100
        : ((e.clientX - rect.left) / rect.width) * 100;
      this.value.set(this.#clamp(pct));
    };
    const onUp = (): void => {
      this.dragging.emit(false);
      if (divider.hasPointerCapture(event.pointerId)) {
        divider.releasePointerCapture(event.pointerId);
      }
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
      divider.removeEventListener('pointercancel', onUp);
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
    divider.addEventListener('pointercancel', onUp);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this.value.set(this.#clamp(this.value() - this.step()));
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this.value.set(this.#clamp(this.value() + this.step()));
        break;
      case 'Home':
        this.value.set(this.min());
        break;
      case 'End':
        this.value.set(this.max());
        break;
      default:
        return;
    }
    event.preventDefault();
  }
}
