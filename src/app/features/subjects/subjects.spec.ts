import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subjects } from './subjects';
import { SubjectService } from '../../core/subjects/subject.service';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('Subjects', () => {
  const tree = signal(SUBJECTS_FIXTURE);
  const loading = signal(false);
  const error = signal(false);
  const subjectsMock = {
    tree,
    loading,
    error,
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<Subjects>> {
    await TestBed.configureTestingModule({
      imports: [Subjects, provideTranslocoTesting()],
      providers: [{ provide: SubjectService, useValue: subjectsMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(Subjects);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<Subjects>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function names(fixture: ComponentFixture<Subjects>): string[] {
    return Array.from(el(fixture).querySelectorAll('.subjects__name')).map((n) =>
      n.textContent?.trim() ?? '',
    );
  }

  beforeEach(() => {
    tree.set(SUBJECTS_FIXTURE);
    loading.set(false);
    error.set(false);
    vi.clearAllMocks();
  });

  it('loads the tree on startup and shows disciplines collapsed', async () => {
    const fixture = await createComponent();
    expect(subjectsMock.load).toHaveBeenCalled();
    expect(names(fixture)).toEqual(['Mathématiques', 'Français']);
  });

  it('expands a node on chevron click', async () => {
    const fixture = await createComponent();
    el(fixture).querySelector<HTMLButtonElement>('.subjects__twistie')?.click();
    await fixture.whenStable();

    expect(names(fixture)).toContain('Algèbre');
  });

  it('“expand all” shows every node', async () => {
    const fixture = await createComponent();
    const expandAll = Array.from(
      el(fixture).querySelectorAll<HTMLButtonElement>('.subjects__actions .btn'),
    )[0];
    expandAll.click();
    await fixture.whenStable();

    expect(names(fixture)).toContain('Espaces vectoriels');
    expect(names(fixture)).toHaveLength(6);
  });

  it('searching expands the branches containing a result', async () => {
    const fixture = await createComponent();
    const search = el(fixture).querySelector<HTMLInputElement>('.subjects__search');
    search!.value = 'espaces';
    search!.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(names(fixture)).toEqual(['Mathématiques', 'Algèbre', 'Espaces vectoriels']);
  });

  it('shows the child count and the level label', async () => {
    const fixture = await createComponent();
    const firstNode = el(fixture).querySelector('.subjects__node');
    expect(firstNode?.querySelector('.subjects__count')?.textContent?.trim()).toBe('2');
    expect(firstNode?.querySelector('.subjects__level')?.textContent?.trim()).toBe('Discipline');
  });

  it('shows a skeleton while loading', async () => {
    loading.set(true);
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.subjects__skeleton')).toBeTruthy();
    expect(el(fixture).querySelector('.subjects__tree')).toBeNull();
  });

  it('shows the error and refetches via the retry button', async () => {
    error.set(true);
    const fixture = await createComponent();
    const retry = el(fixture).querySelector<HTMLButtonElement>('.subjects__error .btn');
    expect(retry).toBeTruthy();
    retry?.click();

    expect(subjectsMock.reload).toHaveBeenCalled();
  });
});
