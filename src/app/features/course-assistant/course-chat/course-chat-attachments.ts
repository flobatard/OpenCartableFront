import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ATTACHMENT_ACCEPT,
  AttachmentKind,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '../../../core/course-assistant/attachment.model';
import { DraftAttachment } from '../../../core/course-assistant/assistant-chat-state';
import { formatBytes } from '../../../core/resources/resource.utils';

/** Une puce du composant : brouillon du composer OU pièce envoyée du fil. */
export interface AttachmentChip {
  key: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  phase: 'uploading' | 'ready' | 'error';
  progress: number;
}

/** Vue de puce d'un brouillon du composer. */
export function chipFromDraft(draft: DraftAttachment): AttachmentChip {
  return {
    key: draft.key,
    name: draft.name,
    kind: draft.kind,
    size: draft.size,
    phase: draft.phase,
    progress: draft.progress,
  };
}

/**
 * Bande des pièces jointes d'un chat, dans ses DEUX emplacements : au-dessus
 * du composer (bouton trombone, puces retirables, zone de dépôt) et sous une
 * bulle du professeur (puces figées, nom cliquable pour ouvrir le fichier).
 *
 * Composant à part — et pas quelques règles ajoutées à `course-chat.scss` —
 * pour le budget `anyComponentStyle` d'`angular.json` : la feuille du chat
 * frôle déjà le plafond d'erreur.
 *
 * Présentational : il ne connaît ni le service d'upload ni l'état du chat, il
 * émet des fichiers choisis (`files`), une demande de retrait (`remove`) ou
 * d'ouverture (`open`).
 */
@Component({
  selector: 'app-course-chat-attachments',
  imports: [TranslocoPipe],
  templateUrl: './course-chat-attachments.html',
  styleUrl: './course-chat-attachments.scss',
})
export class CourseChatAttachments {
  readonly items = input.required<AttachmentChip[]>();
  /** Composer : bouton d'ajout, croix de retrait et dépôt. Fil : rien de tout ça. */
  readonly editable = input(false);
  /** Envoi en cours : l'ajout et le retrait sont neutralisés. */
  readonly busy = input(false);

  readonly files = output<File[]>();
  readonly remove = output<string>();
  readonly open = output<string>();

  protected readonly accept = ATTACHMENT_ACCEPT;
  protected readonly dragging = signal(false);

  /** Non `#privé` : Angular refuse un `viewChild` sur un champ ES private. */
  protected readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Plus rien à joindre : le bouton reste visible mais inactif. */
  protected readonly full = computed(() => this.items().length >= MAX_ATTACHMENTS_PER_MESSAGE);

  protected readonly canAdd = computed(() => this.editable() && !this.busy() && !this.full());

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected openPicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** Le champ est vidé après lecture : rechoisir le MÊME fichier doit marcher. */
  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (picked.length) {
      this.files.emit(picked);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.canAdd()) {
      return;
    }
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    this.dragging.set(false);
    if (!this.canAdd()) {
      return;
    }
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (dropped.length) {
      this.files.emit(dropped);
    }
  }
}
