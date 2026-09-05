import { Component, output, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  buildBlockMetaForm,
  payloadFromBlockMetaForm,
} from '../../../core/courses/block-meta-form';
import { BlockMetaPayload, BlockType } from '../../../core/courses/course.model';
import { NativeDialog } from '../../../shared/dialog/native-dialog.directive';

/**
 * Modale de création d'un bloc : saisie facultative du titre et de la description
 * avant de créer un bloc du type demandé. Élément `<dialog>` natif (focus-trap,
 * Escape, backdrop délégués à la plateforme), calquée sur `MarkdownHelpDialog`.
 * Présentational — pilotée par le parent via `open(type)` / `close()` et émet
 * `create` ; c'est le parent qui appelle l'API et navigue (aucun HTTP ici).
 */
@Component({
  selector: 'app-block-create-dialog',
  imports: [NativeDialog, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './block-create-dialog.html',
  styleUrl: './block-create-dialog.scss',
})
export class BlockCreateDialog {
  protected readonly dialog = viewChild(NativeDialog);

  /** Type du bloc en cours de création (affiché dans le titre de la modale). */
  protected readonly type = signal<BlockType | null>(null);

  protected readonly form = buildBlockMetaForm();

  readonly create = output<{ type: BlockType; meta: BlockMetaPayload }>();

  open(type: BlockType): void {
    this.type.set(type);
    this.form.reset({ title: '', description: '' });
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
  }

  protected submit(): void {
    const type = this.type();
    if (!type) {
      return;
    }
    this.create.emit({ type, meta: payloadFromBlockMetaForm(this.form) });
    this.close();
  }
}
