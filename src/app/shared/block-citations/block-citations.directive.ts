import { Directive, output } from '@angular/core';
import { isBlockId } from '../../core/markdown/course-block-ref';

/**
 * Délégation des citations `oc-block:` d'un fil rendu en markdown : un clic ou
 * Entrée sur une ancre `[data-oc-block-id]` (inerte, posée par `courseMarked`)
 * émet l'id du bloc cité — **re-gardé** `isBlockId` : l'attribut peut venir de
 * HTML brut ou d'un modèle IA, jamais un id non-UUID dans une navigation.
 * C'est l'hôte qui navigue (éditeur du bloc côté prof, bloc public côté élève).
 */
@Directive({
  selector: '[ocBlockCitations]',
  host: {
    '(click)': 'onEvent($event)',
    '(keydown.enter)': 'onEvent($event)',
  },
})
export class BlockCitations {
  readonly blockCitation = output<string>();

  protected onEvent(event: Event): void {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest<HTMLElement>('[data-oc-block-id]');
    const blockId = anchor?.getAttribute('data-oc-block-id');
    if (!blockId || !isBlockId(blockId)) {
      return;
    }
    event.preventDefault();
    this.blockCitation.emit(blockId);
  }
}
