import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MarkdownField } from './markdown-field';
import { MarkdownEditor } from '../markdown-editor/markdown-editor';
import { ResourceService } from '../../core/resources/resource.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { COURSE_RESOURCES_FIXTURE } from '../../testing/resources.fixture';

/**
 * Monaco reste inerte en jsdom (loader AMD non chargé) : les specs pilotent le
 * FormControl public `control`. L'aperçu (marked + KaTeX) tourne, lui, en jsdom.
 * `ResourceService` (picker d'insertion + résolution de l'aperçu) est mocké.
 */
describe('MarkdownField', () => {
  const resourcesMock = {
    list: signal(COURSE_RESOURCES_FIXTURE),
    listLoading: signal(false),
    loadList: vi.fn(),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example/presigned'),
  };

  async function configure(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MarkdownField, provideTranslocoTesting()],
      providers: [{ provide: ResourceService, useValue: resourcesMock }],
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

  it('writeValue alimente le contrôle sans émettre onChange', async () => {
    const fixture = await createComponent();
    const changes: string[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    fixture.componentInstance.writeValue('Bonjour');
    await fixture.whenStable();

    expect(fixture.componentInstance.control.value).toBe('Bonjour');
    expect(changes).toEqual([]);
  });

  it('la frappe dans le contrôle interne relaie la valeur (registerOnChange)', async () => {
    const fixture = await createComponent();
    const changes: string[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    fixture.componentInstance.control.setValue('tapé');
    await fixture.whenStable();

    expect(changes).toEqual(['tapé']);
  });

  it('setDisabledState désactive le contrôle interne', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.setDisabledState(true);
    expect(fixture.componentInstance.control.disabled).toBe(true);

    fixture.componentInstance.setDisabledState(false);
    expect(fixture.componentInstance.control.disabled).toBe(false);
  });

  it('l’onglet aperçu rend le markdown local ; l’éditeur reste monté', async () => {
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

  it('l’aperçu rend les formules LaTeX via KaTeX', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.control.setValue('Soit $x^2$ un carré.');
    await fixture.whenStable();

    tabs(fixture)[1].click();
    await fixture.whenStable();

    expect(el(fixture).querySelector('.markdown-field__preview .katex')).toBeTruthy();
  });

  it('les flèches basculent d’onglet (APG tabs)', async () => {
    const fixture = await createComponent();
    const tablist = el(fixture).querySelector('[role="tablist"]')!;

    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs(fixture)[1].getAttribute('aria-selected')).toBe('true');
  });

  it('deux instances portent des ids de tablist distincts', async () => {
    await configure();
    const a = await instantiate();
    const b = await instantiate();

    expect(tabs(a)[0].id).not.toBe(tabs(b)[0].id);
    // aria-controls reste cohérent avec le panneau de la même instance.
    expect(tabs(a)[0].getAttribute('aria-controls')).toBe(
      a.nativeElement.querySelector('.markdown-field__panel--editor')?.id,
    );
  });

  it('sans courseId : pas de bouton d’insertion de ressource', async () => {
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.markdown-field__insert-btn')).toBeNull();
  });

  it('avec courseId : le bouton d’insertion de ressource apparaît', async () => {
    await configure();
    const fixture = await instantiate('course-1');
    expect(el(fixture).querySelector('.markdown-field__insert-btn')).toBeTruthy();
  });

  it('choisir une ressource insère son snippet markdown au curseur', async () => {
    await configure();
    const fixture = await instantiate('course-1');
    const editor = fixture.debugElement.query(By.directive(MarkdownEditor))
      .componentInstance as MarkdownEditor;
    const insert = vi.spyOn(editor, 'insertAtCursor');

    // Le picker (toujours monté) liste les ressources `disponible` ; on clique la 1re.
    el(fixture).querySelector<HTMLButtonElement>('.res-picker__item')!.click();

    expect(insert).toHaveBeenCalledWith('[schema-suites.pdf](oc-resource:resource-1)');
  });
});
