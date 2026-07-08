import { Component, ElementRef, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Modale d'aide à la mise en forme (markdown + LaTeX/KaTeX + Mermaid),
 * réutilisable par tout éditeur de contenu de cours. Élément `<dialog>` natif :
 * focus-trap, Escape et backdrop gérés par la plateforme. Présentational —
 * pilotée par le parent via les méthodes publiques `open()` / `close()`.
 */
@Component({
  selector: 'app-markdown-help-dialog',
  imports: [TranslocoPipe],
  templateUrl: './markdown-help-dialog.html',
  styleUrl: './markdown-help-dialog.scss',
})
export class MarkdownHelpDialog {
  /** viewChild sur un champ `protected` (jamais `#` — incompatibles). Ref
      nommée `dialogEl` et non `dialog` (une ref de template ne doit pas
      collisionner avec un signal du composant). */
  protected readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  /** Exemple Mermaid affiché dans un `<pre>` (chaîne liée : garde les sauts). */
  protected readonly mermaidExample =
    '```mermaid\ngraph TD\n  A[Début] --> B{Condition ?}\n  B -->|oui| C[Action]\n  B -->|non| D[Fin]\n```';

  open(): void {
    this.dialog()?.nativeElement.showModal();
  }

  close(): void {
    this.dialog()?.nativeElement.close();
  }

  /** Clic sur le fond : le backdrop d'un `<dialog>` cible l'élément lui-même. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }
}
