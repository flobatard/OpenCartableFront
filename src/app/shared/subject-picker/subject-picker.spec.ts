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

  it('loads the tree on startup', async () => {
    await createComponent();
    expect(subjectsMock.load).toHaveBeenCalled();
  });

  it('writeValue restores the full path display', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.writeValue('math-algebre-ev');
    await fixture.whenStable();

    const text = el(fixture).querySelector('.subject-picker__text');
    expect(text?.textContent?.trim()).toBe('Mathématiques › Algèbre › Espaces vectoriels');
  });

  it('emits the node id via registerOnChange on selection', async () => {
    const fixture = await createComponent();
    const changes: (string | null)[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));

    el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field')?.click();
    await fixture.whenStable();
    el(fixture).querySelector<HTMLElement>('.subject-picker__label')?.click();
    await fixture.whenStable();

    expect(changes).toEqual(['math']);
  });

  it('setDisabledState disables the field', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.setDisabledState(true);
    await fixture.whenStable();

    const field = el(fixture).querySelector<HTMLButtonElement>('.subject-picker__field');
    expect(field?.disabled).toBe(true);
  });

  it('leavesOnly makes nodes with children unselectable', async () => {
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

  it('filters at every level and shows the result paths', async () => {
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
