import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Bloc de code exécutable, commun aux langages ```sql et ```python : le code
 * (lecture seule, ou `<textarea>` après « Modifier » — pas de Monaco sur les
 * pages élèves, trop lourd), Exécuter / Arrêter, Réinitialiser si l'élève a
 * modifié le code, puis la sortie projetée par l'hôte. Présentational :
 * l'exécution appartient à l'hôte (`runRequested` porte le code courant).
 * Ctrl/⌘+Entrée exécute depuis l'éditeur.
 */
@Component({
  selector: 'app-runnable-code',
  imports: [TranslocoPipe],
  templateUrl: './runnable-code.html',
  styleUrl: './runnable-code.scss',
})
export class RunnableCode {
  /** Code d'origine (celui du cours). */
  readonly code = input.required<string>();
  /** Nom accessible de l'éditeur (« Requête SQL », « Code Python »…). */
  readonly label = input.required<string>();
  readonly running = input(false);

  readonly runRequested = output<string>();
  readonly stopRequested = output<void>();

  protected readonly editing = signal(false);
  /** Code courant : repart du code d'origine quand celui-ci change. */
  protected readonly draft = linkedSignal(() => this.code());
  protected readonly modified = computed(() => this.draft() !== this.code());
  protected readonly rows = computed(() =>
    Math.min(20, Math.max(3, this.draft().split('\n').length + 1)),
  );

  protected run(): void {
    if (!this.running()) {
      this.runRequested.emit(this.draft());
    }
  }

  protected edit(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected reset(): void {
    this.draft.set(this.code());
  }
}
