import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { MarkdownEditor } from './markdown-editor';

/**
 * En jsdom, le wrapper ngx-monaco-editor est inerte par construction : le
 * `<script>` du loader AMD n'est jamais chargé, monaco n'existe pas. Les
 * specs pilotent donc le relais CVA via le FormControl interne.
 */
@Component({
  imports: [MarkdownEditor, ReactiveFormsModule],
  template: `<app-markdown-editor [formControl]="control" />`,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true });
}

type MarkdownEditorInternals = {
  inner: FormControl<string>;
  onEditorInit(instance: unknown): void;
};

describe('MarkdownEditor', () => {
  async function createHost(): Promise<ComponentFixture<Host>> {
    await TestBed.configureTestingModule({
      imports: [Host, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  function inner(fixture: ComponentFixture<Host>): FormControl<string> {
    const editor = fixture.debugElement.query(By.directive(MarkdownEditor))
      .componentInstance as MarkdownEditor;
    return (editor as unknown as MarkdownEditorInternals).inner;
  }

  it('rend le wrapper monaco sans erreur (inerte en jsdom)', async () => {
    const fixture = await createHost();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('ngx-monaco-editor'),
    ).toBeTruthy();
  });

  it('writeValue alimente le contrôle interne sans marquer le contrôle hôte', async () => {
    const fixture = await createHost();
    fixture.componentInstance.control.setValue('# Titre');

    expect(inner(fixture).value).toBe('# Titre');
    expect(fixture.componentInstance.control.dirty).toBe(false);
    expect(fixture.componentInstance.control.touched).toBe(false);
  });

  it('l’écho du wrapper (même valeur) n’est pas propagé au contrôle hôte', async () => {
    const fixture = await createHost();
    fixture.componentInstance.control.setValue('# Titre');

    // Simule la ré-émission du wrapper après un writeValue (setValue → onDidChangeModelContent).
    inner(fixture).setValue('# Titre');

    expect(fixture.componentInstance.control.dirty).toBe(false);
    expect(fixture.componentInstance.control.touched).toBe(false);
  });

  it('une frappe (valeur différente) est propagée au contrôle hôte', async () => {
    const fixture = await createHost();
    inner(fixture).setValue('## Section');

    expect(fixture.componentInstance.control.value).toBe('## Section');
    expect(fixture.componentInstance.control.touched).toBe(true);
  });

  it('disable() du contrôle hôte désactive le contrôle interne', async () => {
    const fixture = await createHost();
    fixture.componentInstance.control.disable();

    expect(inner(fixture).disabled).toBe(true);

    fixture.componentInstance.control.enable();
    expect(inner(fixture).disabled).toBe(false);
  });

  function editorOf(fixture: ComponentFixture<Host>): MarkdownEditor {
    return fixture.debugElement.query(By.directive(MarkdownEditor)).componentInstance as MarkdownEditor;
  }

  it('insertAtCursor est sans effet tant que monaco n’est pas initialisé', async () => {
    const fixture = await createHost();

    expect(() => editorOf(fixture).insertAtCursor('![x](oc-resource:1)')).not.toThrow();
    expect(fixture.componentInstance.control.value).toBe('');
  });

  it('insertAtCursor délègue à executeEdits de l’instance monaco puis refocus', async () => {
    const fixture = await createHost();
    const editor = editorOf(fixture);
    const executeEdits = vi.fn();
    const focus = vi.fn();
    const selection = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
    (editor as unknown as MarkdownEditorInternals).onEditorInit({
      getSelection: () => selection,
      executeEdits,
      focus,
    });

    editor.insertAtCursor('SNIPPET');

    expect(executeEdits).toHaveBeenCalledWith('insert-resource', [
      { range: selection, text: 'SNIPPET', forceMoveMarkers: true },
    ]);
    expect(focus).toHaveBeenCalledOnce();
  });
});
