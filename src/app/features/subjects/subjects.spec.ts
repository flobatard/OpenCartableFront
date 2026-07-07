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

  it('charge l’arbre au démarrage et affiche les disciplines repliées', async () => {
    const fixture = await createComponent();
    expect(subjectsMock.load).toHaveBeenCalled();
    expect(names(fixture)).toEqual(['Mathématiques', 'Français']);
  });

  it('déplie un nœud au clic sur le chevron', async () => {
    const fixture = await createComponent();
    el(fixture).querySelector<HTMLButtonElement>('.subjects__twistie')?.click();
    await fixture.whenStable();

    expect(names(fixture)).toContain('Algèbre');
  });

  it('« tout déplier » montre tous les nœuds', async () => {
    const fixture = await createComponent();
    const expandAll = Array.from(
      el(fixture).querySelectorAll<HTMLButtonElement>('.subjects__actions .btn'),
    )[0];
    expandAll.click();
    await fixture.whenStable();

    expect(names(fixture)).toContain('Espaces vectoriels');
    expect(names(fixture)).toHaveLength(6);
  });

  it('la recherche déplie les branches contenant un résultat', async () => {
    const fixture = await createComponent();
    const search = el(fixture).querySelector<HTMLInputElement>('.subjects__search');
    search!.value = 'espaces';
    search!.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(names(fixture)).toEqual(['Mathématiques', 'Algèbre', 'Espaces vectoriels']);
  });

  it('affiche le compteur d’enfants et le libellé de niveau', async () => {
    const fixture = await createComponent();
    const firstNode = el(fixture).querySelector('.subjects__node');
    expect(firstNode?.querySelector('.subjects__count')?.textContent?.trim()).toBe('2');
    expect(firstNode?.querySelector('.subjects__level')?.textContent?.trim()).toBe('Discipline');
  });

  it('affiche un skeleton pendant le chargement', async () => {
    loading.set(true);
    const fixture = await createComponent();
    expect(el(fixture).querySelector('.subjects__skeleton')).toBeTruthy();
    expect(el(fixture).querySelector('.subjects__tree')).toBeNull();
  });

  it('affiche l’erreur et relance le fetch via Réessayer', async () => {
    error.set(true);
    const fixture = await createComponent();
    const retry = el(fixture).querySelector<HTMLButtonElement>('.subjects__error .btn');
    expect(retry).toBeTruthy();
    retry?.click();

    expect(subjectsMock.reload).toHaveBeenCalled();
  });
});
