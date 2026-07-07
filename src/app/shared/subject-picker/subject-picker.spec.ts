import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SubjectPicker } from './subject-picker';
import { SubjectService } from '../../core/subjects/subject.service';
import { SUBJECTS_FIXTURE } from '../../testing/subjects.fixture';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('SubjectPicker', () => {
  const tree = signal(SUBJECTS_FIXTURE);
  const subjectsMock = {
    tree,
    loading: signal(false),
    error: signal(false),
    load: vi.fn(),
    reload: vi.fn(),
    tree$: vi.fn(),
  };

  async function createComponent(): Promise<ComponentFixture<SubjectPicker>> {
    await TestBed.configureTestingModule({
      imports: [SubjectPicker, provideTranslocoTesting()],
      providers: [{ provide: SubjectService, useValue: subjectsMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SubjectPicker);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<SubjectPicker>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    tree.set(SUBJECTS_FIXTURE);
    vi.clearAllMocks();
  });

  it('charge l’arbre au démarrage', async () => {
    await createComponent();
    expect(subjectsMock.load).toHaveBeenCalled();
  });

  it('writeValue restaure l’affichage du chemin complet', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue('math-algebre-ev');
    await fixture.whenStable();

    const text = el(fixture).querySelector('.subject-picker__text');
    expect(text?.textContent?.trim()).toBe('Mathématiques › Algèbre › Espaces vectoriels');
  });

  it('émet l’id du nœud via registerOnChange à la sélection', async () => {
    const fixture = await createComponent();
    const changes: (string | null)[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field')?.click();
    await fixture.whenStable();
    el(fixture).querySelector<HTMLElement>('.subject-picker__label')?.click();
    await fixture.whenStable();

    expect(changes).toEqual(['math']);
  });

  it('setDisabledState désactive le champ', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.setDisabledState(true);
    await fixture.whenStable();

    const field = el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field');
    expect(field?.disabled).toBe(true);
  });

  it('leavesOnly rend les nœuds à enfants non sélectionnables', async () => {
    const fixture = await createComponent();
    fixture.componentRef.setInput('leavesOnly', true);
    await fixture.whenStable();

    const changes: (string | null)[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field')?.click();
    await fixture.whenStable();

    const firstOption = el(fixture).querySelector('.subject-picker__option');
    expect(firstOption?.classList.contains('is-disabled')).toBe(true);

    firstOption?.querySelector<HTMLElement>('.subject-picker__label')?.click();
    await fixture.whenStable();
    expect(changes).toEqual([]);
  });

  it('filtre à tous les niveaux et affiche le chemin des résultats', async () => {
    const fixture = await createComponent();
    el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field')?.click();
    await fixture.whenStable();

    const searchInput = el(fixture).querySelector<HTMLInputElement>('.subject-picker__search');
    searchInput!.value = 'espaces';
    searchInput!.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const options = el(fixture).querySelectorAll('.subject-picker__option--flat');
    expect(options).toHaveLength(1);
    expect(options[0].textContent?.trim()).toBe('Mathématiques › Algèbre › Espaces vectoriels');
  });
});
