import { Component, input, output, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NativeDialog } from '../dialog/native-dialog.directive';

/** Compteur de module : ids ARIA uniques par instance (jamais Date.now/Math.random). */
let uid = 0;

/** Les deux formats d'export d'un contenu de cours. */
export type ExportFormat = 'pdf' | 'html';

/** Choix validé dans la modale. */
export interface ExportRequest {
  format: ExportFormat;
  /** Modules embarqués vivants dans la page HTML (sans effet sur le PDF). */
  includeModules: boolean;
}

/**
 * Modale de choix du format d'export d'un contenu de cours : **PDF** (par
 * l'impression native du navigateur, `PrintService`) ou **page HTML autonome**
 * (`ExportHtmlService`). Un seul point d'entrée pour les deux, plutôt qu'une
 * rangée de boutons qui s'allonge — les écrans de téléphone ne l'absorbent pas
 * (§12 du design system).
 *
 * Présentational : elle ne sait pas exporter et **ne se ferme pas d'elle-même**
 * (patron de `CourseEditDialog`) ; l'hôte lance l'export, affiche l'état `busy`
 * et referme. Trois hôtes : `markdown-view` (un bloc), `course-preview` (prof)
 * et `student-content` (élève).
 */
@Component({
  selector: 'app-export-dialog',
  imports: [NativeDialog, TranslocoPipe],
  templateUrl: './export-dialog.html',
  styleUrl: './export-dialog.scss',
})
export class ExportDialog {
  /** Export en cours : le bouton attend, la modale reste ouverte. */
  readonly busy = input(false);

  readonly export = output<ExportRequest>();

  protected readonly dialog = viewChild(NativeDialog);
  protected readonly titleId = `export-dialog-title-${(uid += 1)}`;
  protected readonly fieldName = `export-format-${uid}`;

  /** PDF par défaut : c'est l'export historique, et le plus demandé. */
  protected readonly format = signal<ExportFormat>('pdf');
  protected readonly includeModules = signal(true);

  open(): void {
    this.dialog()?.open();
  }

  close(): void {
    this.dialog()?.close();
  }

  protected submit(): void {
    this.export.emit({
      format: this.format(),
      includeModules: this.includeModules(),
    });
  }

  protected readChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
