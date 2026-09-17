import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { MarkdownEditor, positionInText } from './markdown-editor';

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

  it('renders the monaco wrapper without error (inert in jsdom)', async () => {
    const fixture = await createHost();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('ngx-monaco-editor'),
    ).toBeTruthy();
  });

  it('writeValue feeds the inner control without marking the host control', async () => {
    const fixture = await createHost();
    fixture.componentInstance.control.setValue('# Titre');

    expect(inner(fixture).value).toBe('# Titre');
    expect(fixture.componentInstance.control.dirty).toBe(false);
    expect(fixture.componentInstance.control.touched).toBe(false);
  });

  it('the wrapper’s echo (same value) is not propagated to the host control', async () => {
    const fixture = await createHost();
    fixture.componentInstance.control.setValue('# Titre');

    // Simule la ré-émission du wrapper après un writeValue (setValue → onDidChangeModelContent).
    inner(fixture).setValue('# Titre');

    expect(fixture.componentInstance.control.dirty).toBe(false);
    expect(fixture.componentInstance.control.touched).toBe(false);
  });

  it('a keystroke (different value) is propagated to the host control', async () => {
    const fixture = await createHost();
    inner(fixture).setValue('## Section');

    expect(fixture.componentInstance.control.value).toBe('## Section');
    expect(fixture.componentInstance.control.touched).toBe(true);
  });

  it('disable() on the host control disables the inner control', async () => {
    const fixture = await createHost();
    fixture.componentInstance.control.disable();

    expect(inner(fixture).disabled).toBe(true);

    fixture.componentInstance.control.enable();
    expect(inner(fixture).disabled).toBe(false);
  });

  function editorOf(fixture: ComponentFixture<Host>): MarkdownEditor {
    return fixture.debugElement.query(By.directive(MarkdownEditor)).componentInstance as MarkdownEditor;
  }

  it('insertAtCursor is a no-op until monaco is initialized', async () => {
    const fixture = await createHost();

    expect(() => editorOf(fixture).insertAtCursor('![x](oc-resource:1)')).not.toThrow();
    expect(fixture.componentInstance.control.value).toBe('');
  });

  type Range = {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };

  /** Faux Monaco : sélection et texte sélectionné fixés, appels tracés dans l'ordre. */
  function fakeMonaco(selection: Range, selected = '') {
    const calls: string[] = [];
    const instance = {
      getModel: () => ({ getValueInRange: vi.fn(() => selected) }),
      getSelection: () => selection,
      executeEdits: vi.fn(() => calls.push('edit')),
      pushUndoStop: vi.fn(() => calls.push('stop')),
      setSelection: vi.fn(() => calls.push('select')),
      focus: vi.fn(() => calls.push('focus')),
    };
    return { instance, calls };
  }

  it('insertAtCursor replaces the selection in one undo step then refocuses', async () => {
    const fixture = await createHost();
    const editor = editorOf(fixture);
    const selection = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
    const { instance, calls } = fakeMonaco(selection);
    (editor as unknown as MarkdownEditorInternals).onEditorInit(instance);

    editor.insertAtCursor('SNIPPET');

    expect(instance.executeEdits).toHaveBeenCalledWith('insert-resource', [
      { range: selection, text: 'SNIPPET', forceMoveMarkers: true },
    ]);
    // Curseur laissé après le texte : aucune sélection posée.
    expect(calls).toEqual(['stop', 'edit', 'stop', 'focus']);
  });

  it('replaceSelection reports false and builds nothing until monaco is initialized', async () => {
    const fixture = await createHost();
    const build = vi.fn(() => ({ text: 'x' }));

    expect(editorOf(fixture).replaceSelection(build)).toBe(false);
    expect(build).not.toHaveBeenCalled();
  });

  it('replaceSelection builds from the selected text, then selects the requested range', async () => {
    const fixture = await createHost();
    const editor = editorOf(fixture);
    const selection = { startLineNumber: 3, startColumn: 5, endLineNumber: 4, endColumn: 2 };
    const { instance, calls } = fakeMonaco(selection, 'a\r\nb');
    (editor as unknown as MarkdownEditorInternals).onEditorInit(instance);
    const text = '\n\n::: columns\na\nb\n+++\nDroite\n:::\n\n';
    const build = vi.fn(() => ({ text, select: { start: 22, end: 28 } }));

    expect(editor.replaceSelection(build)).toBe(true);

    // Sélection relue en fins de ligne `\n`, quel que soit l'EOL du modèle.
    expect(build).toHaveBeenCalledWith('a\nb');
    expect(instance.executeEdits).toHaveBeenCalledWith('insert-snippet', [
      { range: selection, text, forceMoveMarkers: true },
    ]);
    // « Droite » : 7e ligne du texte inséré à partir de la ligne 3, colonnes 1 à 7.
    expect(text.slice(22, 28)).toBe('Droite');
    expect(instance.setSelection).toHaveBeenCalledWith({
      startLineNumber: 9,
      startColumn: 1,
      endLineNumber: 9,
      endColumn: 7,
    });
    expect(calls).toEqual(['stop', 'edit', 'stop', 'select', 'focus']);
  });

  it('positionInText counts columns on the insertion line, then restarts at 1', () => {
    const start = { lineNumber: 2, column: 5 };
    expect(positionInText(start, 'abc\ndef', 2)).toEqual({ lineNumber: 2, column: 7 });
    expect(positionInText(start, 'abc\ndef', 5)).toEqual({ lineNumber: 3, column: 2 });
    expect(positionInText(start, '\n\nxy', 4)).toEqual({ lineNumber: 4, column: 3 });
  });

  it('replaceAll reports false until monaco is initialized (caller falls back)', async () => {
    const fixture = await createHost();

    expect(editorOf(fixture).replaceAll('# Proposé')).toBe(false);
    expect(fixture.componentInstance.control.value).toBe('');
  });

  it('replaceAll edits the full range between undo stops (Ctrl-Z friendly)', async () => {
    const fixture = await createHost();
    const editor = editorOf(fixture);
    const calls: string[] = [];
    const fullRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 9, endColumn: 4 };
    const executeEdits = vi.fn(() => calls.push('edit'));
    const pushUndoStop = vi.fn(() => calls.push('stop'));
    (editor as unknown as MarkdownEditorInternals).onEditorInit({
      getModel: () => ({ getFullModelRange: () => fullRange }),
      executeEdits,
      pushUndoStop,
      focus: vi.fn(),
    });

    expect(editor.replaceAll('# Proposé')).toBe(true);

    expect(executeEdits).toHaveBeenCalledWith('apply-proposal', [
      { range: fullRange, text: '# Proposé', forceMoveMarkers: true },
    ]);
    // Une étape d'annulation UNIQUE : bornée par un undo stop de chaque côté.
    expect(calls).toEqual(['stop', 'edit', 'stop']);
  });

  it('writeValue never forwards an already-in-place value to the wrapper', async () => {
    const fixture = await createHost();
    const editor = editorOf(fixture);
    const innerSetValue = vi.spyOn(inner(fixture), 'setValue');

    // Valeur nouvelle : relayée au wrapper.
    editor.writeValue('Bonjour');
    expect(innerSetValue).toHaveBeenCalledTimes(1);

    // Écho de la même valeur : JAMAIS relayé — le writeValue du wrapper fait
    // un editor.setValue asynchrone qui viderait la pile d'annulation.
    editor.writeValue('Bonjour');
    expect(innerSetValue).toHaveBeenCalledTimes(1);

    editor.writeValue('Bonjour — édité');
    expect(innerSetValue).toHaveBeenCalledTimes(2);
  });
});
