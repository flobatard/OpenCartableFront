import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentEditor } from './document-editor';
import { DocumentContentPayload } from '../../../core/courses/course.model';
import { COURSE_RESOURCES_FIXTURE } from '../../../testing/resources.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';

describe('DocumentEditor', () => {
  const AVAILABLE = COURSE_RESOURCES_FIXTURE.filter((r) => r.statut === 'disponible');

  async function createComponent(
    inputs: {
      initial?: Record<string, unknown>;
      resourceId?: string | null;
      resources?: typeof AVAILABLE;
    } = {},
  ): Promise<ComponentFixture<DocumentEditor>> {
    await TestBed.configureTestingModule({
      imports: [DocumentEditor, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocumentEditor);
    fixture.componentRef.setInput(
      'initial',
      inputs.initial ?? { legende: 'Schéma', affichage: 'telechargement' },
    );
    fixture.componentRef.setInput('resourceId', inputs.resourceId ?? 'resource-1');
    fixture.componentRef.setInput('resources', inputs.resources ?? AVAILABLE);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<DocumentEditor>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('initialise le formulaire depuis [initial] sans émettre, et le select depuis [resourceId]', async () => {
    const emissions: DocumentContentPayload[] = [];
    const fixture = await createComponent();
    fixture.componentInstance.contentChange.subscribe((p) => emissions.push(p));

    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      legende: 'Schéma',
      affichage: 'telechargement',
    });
    expect(fixture.componentInstance.resourceControl.value).toBe('resource-1');
    expect(emissions).toEqual([]); // l'init ne déclenche pas l'autosave du parent
  });

  it('émet contentChange à chaque frappe (légende vide → null)', async () => {
    const fixture = await createComponent();
    const emissions: DocumentContentPayload[] = [];
    fixture.componentInstance.contentChange.subscribe((p) => emissions.push(p));

    fixture.componentInstance.form.controls.legende.setValue('Nouvelle légende');
    fixture.componentInstance.form.controls.legende.setValue('   ');

    expect(emissions).toEqual([
      { legende: 'Nouvelle légende', affichage: 'telechargement' },
      { legende: null, affichage: 'telechargement' },
    ]);
  });

  it('émet resourcePick au choix d’une ressource, null pour l’option vide', async () => {
    const fixture = await createComponent();
    const picks: (string | null)[] = [];
    fixture.componentInstance.resourcePick.subscribe((id) => picks.push(id));

    fixture.componentInstance.resourceControl.setValue('resource-2');
    fixture.componentInstance.resourceControl.setValue('');

    expect(picks).toEqual(['resource-2', null]);
  });

  it('un resourceId absent de la liste retombe sur l’option vide (ressource supprimée)', async () => {
    const fixture = await createComponent({ resourceId: 'resource-fantome' });
    expect(fixture.componentInstance.resourceControl.value).toBe('');
  });

  it('resetResource rétablit le select sans émettre (revert après échec du PATCH)', async () => {
    const fixture = await createComponent();
    const picks: (string | null)[] = [];
    fixture.componentInstance.resourcePick.subscribe((id) => picks.push(id));

    fixture.componentInstance.resourceControl.setValue('resource-2');
    fixture.componentInstance.resetResource('resource-1');

    expect(fixture.componentInstance.resourceControl.value).toBe('resource-1');
    expect(picks).toEqual(['resource-2']); // le revert n'a rien émis
  });

  it('sans ressource disponible, un message renvoie vers l’onglet Ressources', async () => {
    const fixture = await createComponent({ resources: [], resourceId: null });
    expect(el(fixture).querySelector('.document-editor__hint')?.textContent).toContain(
      'onglet Ressources',
    );
  });
});
