import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseBlock, CourseDetail } from '../../../core/courses/course.model';
import { CourseService } from '../../../core/courses/course.service';
import { ResourceService } from '../../../core/resources/resource.service';
import { COURSE_DETAIL_FIXTURE } from '../../../testing/courses.fixture';
import { COURSE_RESOURCES_FIXTURE } from '../../../testing/resources.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CoursePreview } from './course-preview';

/** Bloc module ajouté au mix : il doit être omis de l'aperçu (vue élève). */
const MODULE_BLOCK: CourseBlock = {
  id: 'block-module',
  position: 3,
  type: 'module',
  titre: 'Module interactif',
  description: null,
  content: {},
  resource_id: null,
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

  async function createComponent(): Promise<ComponentFixture<CoursePreview>> {
    await TestBed.configureTestingModule({
      imports: [CoursePreview, provideTranslocoTesting()],
      providers: [
        { provide: CourseService, useValue: coursesMock },
        { provide: ResourceService, useValue: resourcesMock },
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

  it('charge la bibliothèque de ressources au montage', async () => {
    await createComponent();
    expect(resourcesMock.loadList).toHaveBeenCalledWith('course-1');
  });

  it('rend les blocs prévisualisables dans l’ordre, module omis', async () => {
    const fixture = await createComponent();
    const rendered = blocks(fixture);
    // texte + document + exercice = 3 ; le module est absent.
    expect(rendered.length).toBe(3);
    expect(el(fixture).textContent).not.toContain('Module interactif');
    // Ordre : texte, puis document, puis exercice. En vue élève, le titre du
    // bloc n’est rendu que pour les documents — l’ordre se lit donc sur le type
    // de contenu de chaque bloc et sur la position des textes rendus.
    const kinds = rendered.map((b) =>
      b.querySelector('app-course-preview-document') ? 'document' : 'markdown',
    );
    expect(kinds).toEqual(['markdown', 'document', 'markdown']);
    const text = el(fixture).textContent ?? '';
    expect(text.indexOf('Introduction aux suites')).toBeLessThan(
      text.indexOf('Étudier la convergence des suites suivantes.'),
    );
  });

  it('rend le markdown du bloc texte', async () => {
    const fixture = await createComponent();
    expect(el(fixture).querySelector('app-markdown-view')?.innerHTML).toContain(
      'Introduction aux suites',
    );
  });

  it('rend le sujet et l’énoncé de l’exercice sans la réponse attendue', async () => {
    const fixture = await createComponent();
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Étudier la convergence des suites suivantes.');
    expect(text).not.toContain('Décroissante et minorée');
  });

  it('délègue le bloc document à app-course-preview-document', async () => {
    const fixture = await createComponent();
    expect(el(fixture).querySelector('app-course-preview-document')).toBeTruthy();
  });

  it('affiche l’état vide quand le cours n’a aucun bloc', async () => {
    detail.set({ ...COURSE_DETAIL_FIXTURE, blocks: [] });
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.course-preview__empty')).toBeTruthy();
    expect(el(fixture).querySelector('.course-preview__block')).toBeNull();
  });
});
