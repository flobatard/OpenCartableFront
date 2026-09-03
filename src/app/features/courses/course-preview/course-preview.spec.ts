import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseBlock, CourseDetail } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { ModuleService } from '../../../core/modules/module.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { COURSE_DETAIL_FIXTURE } from '../../../testing/courses.fixture';
import { COURSE_RESOURCES_FIXTURE } from '../../../testing/resources.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CoursePreview } from './course-preview';

/** Bloc module ajouté au mix : rendu par app-module-embed (vue élève). */
const MODULE_BLOCK: CourseBlock = {
  id: 'block-module',
  position: 3,
  type: 'module',
  title: 'Module interactif',
  description: null,
  content: {},
  resource_id: null,
  module_id: 'module-1',
};

const DETAIL_WITH_MODULE: CourseDetail = {
  ...COURSE_DETAIL_FIXTURE,
  blocks: [...COURSE_DETAIL_FIXTURE.blocks, MODULE_BLOCK],
};

describe('CoursePreview', () => {
  const detail = signal<CourseDetail | null>(DETAIL_WITH_MODULE);
  const coursesMock = { detail };
  const resourcesMock = {
    list: signal(COURSE_RESOURCES_FIXTURE),
    listLoading: signal(false),
    loadList: vi.fn(),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example/presigned'),
  };
  const modulesMock = {
    list: signal([]),
    listLoading: signal(false),
    loadList: vi.fn(),
    getModule: vi.fn().mockResolvedValue({
      id: 'module-1',
      title: 'Quiz interactif',
      html: '<p>Salut</p>',
      css: '',
      js: '',
      created_at: '',
      updated_at: '',
    }),
  };

  async function createComponent(): Promise<ComponentFixture<CoursePreview>> {
    await TestBed.configureTestingModule({
      imports: [CoursePreview, provideTranslocoTesting()],
      providers: [
        { provide: CourseService, useValue: coursesMock },
        { provide: ResourceService, useValue: resourcesMock },
        { provide: ModuleService, useValue: modulesMock },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CoursePreview);
    fixture.componentRef.setInput('courseId', 'course-1');
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<CoursePreview>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function blocks(fixture: ComponentFixture<CoursePreview>): HTMLElement[] {
    return Array.from(el(fixture).querySelectorAll('.course-preview__block'));
  }

  beforeEach(() => {
    detail.set(DETAIL_WITH_MODULE);
    resourcesMock.loadList.mockClear();
  });

  it('loads the resource library on mount', async () => {
    await createComponent();
    expect(resourcesMock.loadList).toHaveBeenCalledWith('course-1');
  });

  it('renders all blocks in order, module included (app-module-embed)', async () => {
    const fixture = await createComponent();
    const rendered = blocks(fixture);
    // texte + document + exercice + module = 4.
    expect(rendered.length).toBe(4);
    // Le titre du bloc module est rendu (comme celui des documents).
    expect(el(fixture).textContent).toContain('Module interactif');
    const kinds = rendered.map((b) =>
      b.querySelector('app-course-preview-document')
        ? 'document'
        : b.querySelector('app-module-embed')
          ? 'module'
          : 'markdown',
    );
    expect(kinds).toEqual(['markdown', 'document', 'markdown', 'module']);
    // Le module du bloc est résolu par son id via le service.
    expect(modulesMock.getModule).toHaveBeenCalledWith('course-1', 'module-1');
    const text = el(fixture).textContent ?? '';
    expect(text.indexOf('Introduction aux suites')).toBeLessThan(
      text.indexOf('Étudier la convergence des suites suivantes.'),
    );
  });

  it('fully hides a still-empty module block (student view)', async () => {
    detail.set({
      ...DETAIL_WITH_MODULE,
      blocks: [
        ...DETAIL_WITH_MODULE.blocks,
        { ...MODULE_BLOCK, id: 'block-module-vide', position: 4, title: 'Brouillon', module_id: null },
      ],
    });
    const fixture = await createComponent();
    // Ni article, ni titre, ni notice « Aucun module choisi » : un bloc module
    // sans module n'est pas du contenu élève (et sans data-oc-module-id il
    // échapperait à la note d'impression).
    expect(blocks(fixture).length).toBe(4);
    expect(el(fixture).querySelectorAll('app-module-embed').length).toBe(1);
    const text = el(fixture).textContent ?? '';
    expect(text).not.toContain('Brouillon');
    expect(text).not.toContain('Aucun module');
    expect(text).not.toContain('moduleEmbed.none');
  });

  it('renders the text block’s markdown', async () => {
    const fixture = await createComponent();
    expect(el(fixture).querySelector('app-markdown-view')?.innerHTML).toContain(
      'Introduction aux suites',
    );
  });

  it('renders the exercise as numbered read-only questions, without the expected answer', async () => {
    const fixture = await createComponent();
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Étudier la convergence des suites suivantes.');
    expect(text).toContain('Question 1');
    expect(text).not.toContain('Décroissante et minorée');
    // Aperçu prof = vue élève en lecture seule : ni zone de réponse, ni CTA.
    expect(el(fixture).querySelector('textarea')).toBeNull();
    expect(el(fixture).querySelector('.course-preview__exercise-cta')).toBeNull();
  });

  it('delegates the document block to app-course-preview-document', async () => {
    const fixture = await createComponent();
    expect(el(fixture).querySelector('app-course-preview-document')).toBeTruthy();
  });

  it('shows the empty state when the course has no blocks', async () => {
    detail.set({ ...COURSE_DETAIL_FIXTURE, blocks: [] });
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-preview__empty')).toBeTruthy();
    expect(el(fixture).querySelector('.course-preview__block')).toBeNull();
  });
});
