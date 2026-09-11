import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownExtensionComponent } from '../markdown-extension.model';
import { RunnableCode } from '../runnable-code/runnable-code';
import { parseSqlSource } from './sql-config';
import { SQL_EXEC_TIMEOUT_MS, SqlRunResult, SqlRuntime } from './sql-runtime';

/** Lignes affichées par jeu de résultats (le compte réel est indiqué). */
export const SQL_MAX_ROWS = 200;

/**
 * Rendu d'un fence ```sql : requête SQLite exécutable dans le navigateur de
 * l'élève (sql.js, `SqlRuntime`). La préparation (avant `-- @query`) est
 * repliée ; la requête est modifiable et relançable. Le moteur WASM n'est
 * téléchargé qu'au premier « Exécuter ». Résultats en tableaux rendus par le
 * template (donc échappés), plafonnés à `SQL_MAX_ROWS` lignes.
 */
@Component({
  selector: 'app-sql-view',
  imports: [RunnableCode, TranslocoPipe],
  templateUrl: './sql-view.html',
  styleUrl: './sql-view.scss',
})
export class SqlView implements MarkdownExtensionComponent {
  /** Source brute du fence (contrat d'extension). */
  readonly source = input.required<string>();

  protected readonly parsed = computed(() => parseSqlSource(this.source()));
  protected readonly running = signal(false);
  protected readonly result = signal<SqlRunResult | null>(null);
  protected readonly maxRows = SQL_MAX_ROWS;
  protected readonly timeoutSeconds = SQL_EXEC_TIMEOUT_MS / 1000;

  readonly #runtime = inject(SqlRuntime);
  protected readonly loadingEngine = computed(() => this.running() && !this.#runtime.ready());
  #destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.#destroyed = true));
  }

  protected async run(query: string): Promise<void> {
    this.running.set(true);
    this.result.set(null);
    const result = await this.#runtime.run(this.parsed().setup, query);
    if (this.#destroyed) {
      return;
    }
    this.result.set(result);
    this.running.set(false);
  }

  protected stop(): void {
    this.#runtime.stop();
  }

  protected cell(value: unknown): string {
    if (value === null) {
      return 'NULL';
    }
    return value instanceof Uint8Array ? `[BLOB ${value.length} o]` : String(value);
  }

  protected lineCount(text: string): number {
    return text.split('\n').length;
  }
}
