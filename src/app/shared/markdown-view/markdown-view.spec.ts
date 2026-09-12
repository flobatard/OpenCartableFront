import { Component, input, Provider, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { MarkdownView } from './markdown-view';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { COURSE_MODULE_RESOLVER } from '../../core/course-content/course-content-resolvers';
import { ResourceService } from '../../core/resources/resource.service';
import { ExportDialog } from '../export-dialog/export-dialog';
import { ExportHtmlService } from '../export-html/export-html.service';
import { COURSE_RESOURCES_FIXTURE } from '../../testing/resources.fixture';
import {
  MARKDOWN_EXTENSIONS,
  MarkdownExtensionComponent,
} from '../markdown-extensions/markdown-extension.model';

/** Extension factice : jsdom ne monte ni iframe ni SVG utiles, un span suffit. */
@Component({ template: '<span class="fake-ext">{{ source() }}</span>' })
class FakeExtension implements MarkdownExtensionComponent {
  readonly source = input.required<string>();
}

const FAKE_EXTENSION_DEF = {
  language: 'fake',
  isPrintable: false,
  loadComponent: () => Promise.resolve(FakeExtension as Type<MarkdownExtensionComponent>),
  doc: { loadComponent: () => Promise.resolve(FakeExtension as Type<unknown>) },
};

/**
 * Le rendu markdown+KaTeX (marked) tourne en jsdom ; la passe Mermaid, non
 * (elle exige un vrai navigateur). La passe ressources, elle, tourne (DOMParser
 * jsdom) : `ResourceService` est mocké par des signaux + vi.fn().
 */
describe('MarkdownView', () => {
  let resourcesMock: {
    list: ReturnType<typeof signal<typeof COURSE_RESOURCES_FIXTURE>>;
    listLoading: ReturnType<typeof signal<boolean>>;
    loadList: ReturnType<typeof vi.fn>;
    getDownloadUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resourcesMock = {
      list: signal(COURSE_RESOURCES_FIXTURE),
      listLoading: signal(false),
      loadList: vi.fn(),
      getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example/presigned'),
    };
  });

  async function createComponent(
    markdown: string,
    courseId: string | null = null,
    extraProviders: Provider[] = [],
  ): Promise<ComponentFixture<MarkdownView>> {
    await TestBed.configureTestingModule({
      imports: [MarkdownView, provideTranslocoTesting()],
      providers: [
        { provide: ResourceService, useValue: resourcesMock },
        { provide: MARKDOWN_EXTENSIONS, useValue: FAKE_EXTENSION_DEF, multi: true },
        ...extraProviders,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MarkdownView);
    fixture.componentRef.setInput('markdown', markdown);
    if (courseId !== null) {
      fixture.componentRef.setInput('courseId', courseId);
    }
    await fixture.whenStable();
    return fixture;
  }

  function content(fixture: ComponentFixture<MarkdownView>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.markdown-view__content');
  }

  it('renders the markdown as HTML inside .course-content', async () => {
    const fixture = await createComponent('## Section');
    expect(content(fixture)?.innerHTML).toContain('<h2>');
    expect(content(fixture)?.classList.contains('course-content')).toBe(true);
  });

  it('renders LaTeX formulas via KaTeX', async () => {
    const fixture = await createComponent('Soit $x^2$ un carré.');
    expect(content(fixture)?.querySelector('.katex')).toBeTruthy();
  });

  it('titles callouts in the interface language, re-rendered when it changes', async () => {
    const fixture = await createComponent('> [!KEYPOINT]\n> Le périmètre du cercle vaut $2\\pi r$.');
    const title = () => content(fixture)?.querySelector('.course-callout__title')?.textContent;
    expect(title()).toBe('À retenir');

    TestBed.inject(TranslocoService).setActiveLang('en');
    await fixture.whenStable();
    expect(title()).toBe('Key point');
  });

  it('an empty markdown renders no content', async () => {
    const fixture = await createComponent('');
    expect(content(fixture)?.innerHTML.trim()).toBe('');
  });

  it('without a courseId, an oc-resource reference stays an unresolved placeholder', async () => {
    const fixture = await createComponent('![illus](oc-resource:resource-2)');
    await fixture.whenStable();
    expect(resourcesMock.getDownloadUrl).not.toHaveBeenCalled();
    expect(content(fixture)?.querySelector('[data-oc-resource-id]')).toBeTruthy();
  });

  it('with a courseId, resolves an oc-resource image via getDownloadUrl', async () => {
    const fixture = await createComponent('![illus](oc-resource:resource-2)', 'course-1');
    await fixture.whenStable();
    // laisse la chaîne async (présignature + passe DOM) se dérouler.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(resourcesMock.getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-2');
    const img = content(fixture)?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://s3.example/presigned');
    // Le placeholder « pending » a bien été remplacé ; l'id reste posé sur
    // l'élément résolu (data-*) pour l'export PDF (reconstruction d'URL stable).
    expect(content(fixture)?.querySelector('.course-resource--pending')).toBeNull();
    expect(img?.getAttribute('data-oc-resource-id')).toBe('resource-2');
  });

  it('mounts the extension component on a registered fence’s placeholder', async () => {
    const fixture = await createComponent('```fake\nid=abc\nwidth=600\n```');
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    const host = content(fixture)?.querySelector('[data-oc-extension="fake"]');
    expect(host).toBeTruthy();
    // Le composant a remplacé la source ; il l'a reçue en input intacte
    // (verbatim, y compris la newline finale du fence — les parseurs tolèrent).
    expect(host?.querySelector('.fake-ext')?.textContent).toBe('id=abc\nwidth=600\n');
    expect(host?.classList.contains('course-extension--pending')).toBe(false);
  });

  it('remounts without orphans when the markdown changes', async () => {
    const fixture = await createComponent('```fake\na=1\n```');
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    fixture.componentRef.setInput('markdown', 'avant\n\n```fake\na=2\n```');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    const mounted = content(fixture)?.querySelectorAll('.fake-ext');
    expect(mounted).toHaveLength(1);
    expect(mounted?.[0].textContent).toBe('a=2\n');
  });

  it('leaves a fence of an unregistered language as a normal code block', async () => {
    const fixture = await createComponent('```python\nprint(1)\n```');
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(content(fixture)?.querySelector('pre > code.language-python')).toBeTruthy();
    expect(content(fixture)?.querySelector('[data-oc-extension]')).toBeNull();
  });

  it('a resolved render is frozen: a later library refetch neither re-renders nor re-presigns', async () => {
    const fixture = await createComponent('![illus](oc-resource:resource-2)', 'course-1');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(resourcesMock.getDownloadUrl).toHaveBeenCalledTimes(1);
    const img = content(fixture)?.querySelector('img');

    // Une page hôte traversée refait un loadList : loading, puis nouvelle
    // référence de liste. Le rendu résolu ne doit pas broncher (sinon, saut
    // de scroll du fil de l'assistant persistant à chaque navigation).
    resourcesMock.listLoading.set(true);
    await fixture.whenStable();
    resourcesMock.list.set([...COURSE_RESOURCES_FIXTURE]);
    resourcesMock.listLoading.set(false);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(resourcesMock.getDownloadUrl).toHaveBeenCalledTimes(1); // pas de re-présignature
    expect(content(fixture)?.querySelector('img')).toBe(img!); // DOM intact, aucun flash
  });

  it('changing the markdown lifts the freeze and resolves again', async () => {
    const fixture = await createComponent('![illus](oc-resource:resource-2)', 'course-1');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    expect(resourcesMock.getDownloadUrl).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('markdown', 'modifié\n\n![illus](oc-resource:resource-2)');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(resourcesMock.getDownloadUrl).toHaveBeenCalledTimes(2);
    expect(content(fixture)?.querySelector('img')?.getAttribute('src')).toBe(
      'https://s3.example/presigned',
    );
  });

  it('a pending reference is not presigned (unavailable note)', async () => {
    const fixture = await createComponent('[capsule](oc-resource:resource-3)', 'course-1');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(resourcesMock.getDownloadUrl).not.toHaveBeenCalled();
    expect(content(fixture)?.querySelector('.course-resource--missing')).toBeTruthy();
  });

  it('shows the “reading style” button and mounts the dialog in course context', async () => {
    const fixture = await createComponent('## Titre', 'course-1');
    const host = fixture.nativeElement as HTMLElement;
    // aria-label résolu par Transloco (langue par défaut fr).
    expect(host.querySelector('button[aria-label="Style de lecture"]')).toBeTruthy();
    expect(host.querySelector('app-course-style-dialog')).toBeTruthy();
  });

  it('mounts the export dialog only on the first click of the export button', async () => {
    const fixture = await createComponent('## Le théorème\n\nUn texte.', 'course-1');
    const host = fixture.nativeElement as HTMLElement;
    // Une page de cours monte un markdown-view par bloc : rien dans le DOM
    // tant que personne n'exporte.
    expect(host.querySelector('app-export-dialog')).toBeNull();

    host.querySelector<HTMLButtonElement>('button[aria-label="Exporter ce bloc"]')!.click();
    await fixture.whenStable();

    expect(host.querySelector('app-export-dialog')).toBeTruthy();
  });

  it('exports the rendered block as a standalone page, titled by its first heading', async () => {
    const exportMock = { exportCourseContent: vi.fn().mockResolvedValue(null) };
    const modulesMock = { getModule: vi.fn() };
    const fixture = await createComponent('## Le théorème\n\nUn texte.', 'course-1', [
      { provide: ExportHtmlService, useValue: exportMock },
      { provide: COURSE_MODULE_RESOLVER, useValue: modulesMock },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('button[aria-label="Exporter ce bloc"]')!.click();
    await fixture.whenStable();
    const native = host.querySelector('dialog') as HTMLDialogElement;
    native.showModal = vi.fn();
    native.close = vi.fn();
    fixture.debugElement
      .query(By.directive(ExportDialog))
      .componentInstance.export.emit({ format: 'html', includeModules: true });
    await fixture.whenStable();

    const [source, options] = exportMock.exportCourseContent.mock.calls[0];
    expect((source as HTMLElement).classList.contains('markdown-view__content')).toBe(true);
    expect(options.courseId).toBe('course-1');
    expect(options.title).toBe('Le théorème');
  });

  it('hides the style button and dialog outside course context', async () => {
    const fixture = await createComponent('## Titre');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('button[aria-label="Style de lecture"]')).toBeNull();
    expect(host.querySelector('app-course-style-dialog')).toBeNull();
  });

  it('applies the style variables to the container in course context', async () => {
    const fixture = await createComponent('## Titre', 'course-1');
    // Facteurs neutres par défaut, posés en inline sur .course-content.
    expect(content(fixture)?.style.getPropertyValue('--course-font-scale')).toBe('1');
    expect(content(fixture)?.style.getPropertyValue('--course-font')).toBe('var(--font-sans)');
  });
});
