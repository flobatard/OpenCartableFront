import { Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  buildBlockMetaForm,
  payloadFromBlockMetaForm,
} from '../../../core/courses/block-meta-form';
import { BlockMetaPayload, CreatableBlockType } from '../../../core/courses/course.model';

/**
 * Modale de création d'un bloc : saisie facultative du titre et de la description
 * avant de créer un bloc du type demandé. Élément `<dialog>` natif (focus-trap,
 * Escape, backdrop délégués à la plateforme), calquée sur `MarkdownHelpDialog`.
 * Présentational — pilotée par le parent via `open(type)` / `close()` et émet
 * `create` ; c'est le parent qui appelle l'API et navigue (aucun HTTP ici).
 */
@Component({
  selector: 'app-block-create-dialog',
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './block-create-dialog.html',
  styleUrl: './block-create-dialog.scss',
})
export class BlockCreateDialog {
  /** viewChild `protected` (jamais `#`) ; ref template `#dialogEl` ≠ signal `dialog`. */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  /** Type du bloc en cours de création (affiché dans le titre de la modale). */
  protected readonly type = signal<CreatableBlockType | null>(null);

  protected readonly form = buildBlockMetaForm();

  readonly create = output<{ type: CreatableBlockType; meta: BlockMetaPayload }>();

  open(type: CreatableBlockType): void {
    this.type.set(type);
    this.form.reset({ titre: '', description: '' });
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    this.dialog()?.nativeElement.close();
  }

  protected submit(): void {
    const type = this.type();
    if (!type) {
      return;
    }
    this.create.emit({ type, meta: payloadFromBlockMetaForm(this.form) });
    this.close();
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }
}
