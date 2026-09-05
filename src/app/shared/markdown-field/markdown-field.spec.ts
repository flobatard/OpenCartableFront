import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { MarkdownField } from './markdown-field';
import { MarkdownEditor } from '../markdown-editor/markdown-editor';
import { ModuleService } from '../../core/modules/module.service';
import { ResourceService } from '../../core/resources/resource.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { COURSE_RESOURCES_FIXTURE } from '../../testing/resources.fixture';
import { mockModuleService, mockResourceService } from '../../testing/service-mocks';

/**
 * Monaco reste inerte en jsdom (loader AMD non chargé) : les specs pilotent le
 * FormControl public `control`. L'aperçu (marked + KaTeX) tourne, lui, en jsdom.
 * `ResourceService` (picker d'insertion + résolution de l'aperçu) et
 * `ModuleService` (picker de module) sont mockés.
 */
describe('MarkdownField', () => {
  const resourcesMock = mockResourceService(
    COURSE_RESOURCES_FIXTURE,
    'https://s3.example/presigned',
  );
  const modulesMock = mockModuleService([
    { id: 'module-1', title: 'Quiz interactif', created_at: '', updated_at: '' },
  ]);

  async function configure(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MarkdownField, provideTranslocoTesting()],
      // provideRouter : la modale d'aide embarquée porte des RouterLink.
      providers: [
        provideRouter([]),
        { provide: ResourceService, useValue: resourcesMock },
        { provide: ModuleService, useValue: modulesMock },
      ],
    }).compileComponents();
  }

  async function instantiate(courseId: string | null = null): Promise<ComponentFixture<MarkdownField>> {
    const fixture = TestBed.createComponent(MarkdownField);
    if (courseId !== null) {
      fixture.componentRef.setInput('courseId', courseId);
    }
    await fixture.whenStable();
    return fixture;
  }

  async function createComponent(): Promise<ComponentFixture<MarkdownField>> {
    await configure();
    return instantiate();
  }

  function el(fixture: ComponentFixture<MarkdownField>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tabs(fixture: ComponentFixture<MarkdownField>): HTMLButtonElement[] {
    return [...el(fixture).querySelectorAll<HTMLButtonElement>('button[role="tab"]')];
  }

  it('writeValue feeds the control without emitting onChange', async () => {
    const fixture = await createComponent();
    const changes: string[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    fixture.componentInstance.writeValue('Bonjour');
    await fixture.whenStable();

    expect(fixture.componentInstance.control.value).toBe('Bonjour');
    expect(changes).toEqual([]);
  });

  it('typing in the inner control relays the value (registerOnChange)', async () => {
    const fixture = await createComponent();
    const changes: string[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    fixture.componentInstance.control.setValue('tapé');
    await fixture.whenStable();

    expect(changes).toEqual(['tapé']);
  });

  it('setDisabledState disables the inner control', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.setDisabledState(true);
    expect(fixture.componentInstance.control.disabled).toBe(true);

    fixture.componentInstance.setDisabledState(false);
    expect(fixture.componentInstance.control.disabled).toBe(false);
  });

  it('the preview tab renders the local markdown; the editor stays mounted', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.control.setValue('## Section');
    await fixture.whenStable();

    tabs(fixture)[1].click(); // aperçu
    await fixture.whenStable();

    expect(el(fixture).querySelector('.markdown-field__preview')?.innerHTML).toContain('<h2>');
    const editorPanel = el(fixture).querySelector<HTMLElement>('.markdown-field__panel--editor');
    expect(editorPanel).toBeTruthy(); // masqué, pas détruit
    expect(editorPanel?.hidden).toBe(true);
  });

  it('the preview renders LaTeX formulas via KaTeX', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.control.setValue('Soit $x^2$ un carré.');
    await fixture.whenStable();

    tabs(fixture)[1].click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.markdown-field__preview .katex')).toBeTruthy();
  });

  it('arrow keys switch tabs (APG tabs)', async () => {
    const fixture = await createComponent();
    const tablist = el(fixture).querySelector('[role="tablist"]')!;

    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs(fixture)[1].getAttribute('aria-selected')).toBe('true');
  });

  it('two instances carry distinct tablist ids', async () => {
    await configure();
    const a = await instantiate();
    const b = await instantiate();

    expect(tabs(a)[0].id).not.toBe(tabs(b)[0].id);
    // aria-controls reste cohérent avec le panneau de la même instance.
    expect(tabs(a)[0].getAttribute('aria-controls')).toBe(
      a.nativeElement.querySelector('.markdown-field__panel--editor')?.id,
    );
  });

  it('without courseId: no resource insertion button', async () => {
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.markdown-field__insert-btn')).toBeNull();
  });

  it('with courseId: the resource insertion button appears', async () => {
    await configure();
    const fixture = await instantiate('course-1');
    expect(el(fixture).querySelector('.markdown-field__insert-btn')).toBeTruthy();
  });

  it('picking a resource inserts its markdown snippet at the cursor', async () => {
    await configure();
    const fixture = await instantiate('course-1');
    const editor = fixture.debugElement.query(By.directive(MarkdownEditor))
      .componentInstance as MarkdownEditor;
    const insert = vi.spyOn(editor, 'insertAtCursor');

    // Le picker (toujours monté) liste les ressources `available` ; on clique la 1re.
    el(fixture).querySelector<HTMLButtonElement>('.res-picker__item')!.click();

    expect(insert).toHaveBeenCalledWith('[schema-suites.pdf](oc-resource:resource-1)');
  });

  it('replaceAll delegates to the monaco editor and reports its outcome', async () => {
    const fixture = await createComponent();
    const editor = fixture.debugElement.query(By.directive(MarkdownEditor))
      .componentInstance as MarkdownEditor;

    // jsdom : monaco jamais initialisé → false, l'hôte se replie sur son contrôle.
    expect(fixture.componentInstance.replaceAll('# Proposé')).toBe(false);

    const replace = vi.spyOn(editor, 'replaceAll').mockReturnValue(true);
    expect(fixture.componentInstance.replaceAll('# Proposé')).toBe(true);
    expect(replace).toHaveBeenCalledWith('# Proposé');
  });
});
