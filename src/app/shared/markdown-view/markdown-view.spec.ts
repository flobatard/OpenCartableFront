import { Component, input, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownView } from './markdown-view';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ResourceService } from '../../core/resources/resource.service';
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
  ): Promise<ComponentFixture<MarkdownView>> {
    await TestBed.configureTestingModule({
      imports: [MarkdownView, provideTranslocoTesting()],
      providers: [
        { provide: ResourceService, useValue: resourcesMock },
        { provide: MARKDOWN_EXTENSIONS, useValue: FAKE_EXTENSION_DEF, multi: true },
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

  it('rend le markdown en HTML dans .course-content', async () => {
    const fixture = await createComponent('## Section');
    expect(content(fixture)?.innerHTML).toContain('<h2>');
    expect(content(fixture)?.classList.contains('course-content')).toBe(true);
  });

  it('rend les formules LaTeX via KaTeX', async () => {
    const fixture = await createComponent('Soit $x^2$ un carré.');
    expect(content(fixture)?.querySelector('.katex')).toBeTruthy();
  });

  it('un markdown vide ne rend aucun contenu', async () => {
    const fixture = await createComponent('');
    expect(content(fixture)?.innerHTML.trim()).toBe('');
  });

  it('sans courseId, une référence oc-resource reste un placeholder non résolu', async () => {
    const fixture = await createComponent('![illus](oc-resource:resource-2)');
    await fixture.whenStable();
    expect(resourcesMock.getDownloadUrl).not.toHaveBeenCalled();
    expect(content(fixture)?.querySelector('[data-oc-resource-id]')).toBeTruthy();
  });

  it('avec un courseId, résout une image oc-resource via getDownloadUrl', async () => {
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

  it('monte le composant d’extension sur le placeholder d’un fence enregistré', async () => {
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

  it('re-monte sans orphelin quand le markdown change', async () => {
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

  it('laisse un fence de langage non enregistré en bloc de code normal', async () => {
    const fixture = await createComponent('```python\nprint(1)\n```');
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(content(fixture)?.querySelector('pre > code.language-python')).toBeTruthy();
    expect(content(fixture)?.querySelector('[data-oc-extension]')).toBeNull();
  });

  it('une référence en_attente n’est pas présignée (note indisponible)', async () => {
    const fixture = await createComponent('[capsule](oc-resource:resource-3)', 'course-1');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(resourcesMock.getDownloadUrl).not.toHaveBeenCalled();
    expect(content(fixture)?.querySelector('.course-resource--missing')).toBeTruthy();
  });
});
