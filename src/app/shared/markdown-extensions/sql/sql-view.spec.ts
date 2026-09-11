import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { SqlRunResult, SqlRuntime } from './sql-runtime';
import { SQL_MAX_ROWS, SqlView } from './sql-view';

const SOURCE = "CREATE TABLE t (n INTEGER, nom TEXT);\nINSERT INTO t VALUES (1, NULL);\n-- @query\nSELECT * FROM t;";

function setup(result: SqlRunResult) {
  const runtime = {
    ready: signal(false),
    run: vi.fn((_setup: string, _query: string) => Promise.resolve(result)),
    stop: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [provideTranslocoTesting()],
    providers: [{ provide: SqlRuntime, useValue: runtime }],
  });
  const fixture = TestBed.createComponent(SqlView);
  fixture.componentRef.setInput('source', SOURCE);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const runButton = () =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Exécuter'))!;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  return { runtime, el, runButton, settle };
}

describe('SqlView', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('folds the setup and shows only the query, without running anything', () => {
    const { runtime, el } = setup({ status: 'ok', results: [] });
    expect(el.querySelector('details.sql-view__setup pre')?.textContent).toContain('CREATE TABLE t');
    expect(el.querySelector('.runnable__code')?.textContent).toBe('SELECT * FROM t;');
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it('runs setup + query and renders each result set as an escaped table', async () => {
    const { runtime, el, runButton, settle } = setup({
      status: 'ok',
      results: [{ columns: ['n', 'nom'], values: [[1, null], [2, '<b>x</b>']] }],
    });
    runButton().click();
    await settle();
    expect(runtime.run).toHaveBeenCalledWith(
      'CREATE TABLE t (n INTEGER, nom TEXT);\nINSERT INTO t VALUES (1, NULL);',
      'SELECT * FROM t;',
    );
    const headers = [...el.querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['n', 'nom']);
    const cells = [...el.querySelectorAll('td')];
    expect(cells[1].textContent?.trim()).toBe('NULL');
    expect(cells[1].classList).toContain('sql-view__null');
    expect(cells[3].textContent?.trim()).toBe('<b>x</b>');
    expect(el.querySelector('td b')).toBeNull();
    expect(el.querySelector('.sql-view__meta')?.textContent).toContain('Lignes : 2');
  });

  it('caps long results and says so', async () => {
    const values = Array.from({ length: SQL_MAX_ROWS + 5 }, (_, i) => [i]);
    const { el, runButton, settle } = setup({ status: 'ok', results: [{ columns: ['i'], values }] });
    runButton().click();
    await settle();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(SQL_MAX_ROWS);
    expect(el.querySelector('.sql-view__meta')?.textContent).toContain(
      `${SQL_MAX_ROWS} lignes affichées sur ${SQL_MAX_ROWS + 5}`,
    );
  });

  it('tells setup errors, query errors and timeouts apart', async () => {
    const setupError = setup({ status: 'error', phase: 'setup', message: 'no such table: x' });
    setupError.runButton().click();
    await setupError.settle();
    expect(setupError.el.querySelector('.sql-view__error')?.textContent).toContain(
      'Erreur dans la préparation de la base',
    );
    expect(setupError.el.querySelector('.sql-view__error code')?.textContent).toBe('no such table: x');

    TestBed.resetTestingModule();
    const timeout = setup({ status: 'timeout' });
    timeout.runButton().click();
    await timeout.settle();
    expect(timeout.el.querySelector('.sql-view__error')?.textContent).toContain('plus de 5 secondes');
  });

  it('a statement without rows reports that it ran', async () => {
    const { el, runButton, settle } = setup({ status: 'ok', results: [] });
    runButton().click();
    await settle();
    expect(el.querySelector('.sql-view__meta')?.textContent).toContain('aucun résultat');
  });
});
