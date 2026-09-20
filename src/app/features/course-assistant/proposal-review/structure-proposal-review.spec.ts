import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssistantStructureProposal } from '../../../core/course-assistant/proposals';
import { CourseBlock } from '../../../core/courses/course.model';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { StructureProposalReview } from './structure-proposal-review';

function block(id: string, title: string, position: number): CourseBlock {
  return {
    id,
    position,
    type: 'text',
    title,
    description: null,
    content: { markdown: '' },
    resource_id: null,
    module_id: null,
  };
}

const BLOCKS = [block('b-1', 'Intro', 0), block('b-2', 'Cours', 1), block('b-3', 'Bilan', 2)];

describe('StructureProposalReview', () => {
  async function createComponent(
    proposal: AssistantStructureProposal,
  ): Promise<ComponentFixture<StructureProposalReview>> {
    await TestBed.configureTestingModule({
      imports: [StructureProposalReview, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureProposalReview);
    fixture.componentRef.setInput('proposal', proposal);
    fixture.componentRef.setInput('blocks', BLOCKS);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<StructureProposalReview>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function acceptButton(fixture: ComponentFixture<StructureProposalReview>): HTMLButtonElement {
    return el(fixture).querySelector<HTMLButtonElement>('app-proposal-decision .btn--primary')!;
  }

  it('describes an addition: type, title, pointer and position', async () => {
    const fixture = await createComponent({
      kind: 'block_add',
      id: 's1',
      summary: 'Une fiche de synthèse',
      blockType: 'document',
      title: 'Fiche',
      description: 'À imprimer',
      afterId: 'b-2',
      resourceId: 'r-1',
      resourceName: 'fiche.pdf',
      moduleId: null,
      moduleTitle: null,
    });
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Nouveau bloc');
    expect(text).toContain('Une fiche de synthèse');
    expect(text).toContain('Inséré après « Cours »');
    expect(text).toContain('Document');
    expect(text).toContain('fiche.pdf');
    // Un document est complet dès l'ajout : pas d'annonce de bloc vide.
    expect(text).not.toContain('créé vide');
    expect(acceptButton(fixture).disabled).toBe(false);
  });

  it('places an addition at the end when there is no anchor, and announces the empty block', async () => {
    const fixture = await createComponent({
      kind: 'block_add',
      id: 's1',
      summary: null,
      blockType: 'exercise',
      title: 'Application',
      description: null,
      afterId: null,
      resourceId: null,
      resourceName: null,
      moduleId: null,
      moduleTitle: null,
    });
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Ajouté en fin de cours');
    expect(text).toContain('créé vide');
  });

  it('warns about a removal and shows the targeted block', async () => {
    const fixture = await createComponent({
      kind: 'block_delete',
      id: 's2',
      summary: null,
      blockId: 'b-3',
      targetTitle: 'Bilan',
    });
    expect(el(fixture).querySelector('.structure-review__warning')).not.toBeNull();
    expect(el(fixture).querySelector('.structure-review__card--removed')?.textContent).toContain(
      'Bilan',
    );
    expect(acceptButton(fixture).disabled).toBe(false);
  });

  it('only allows rejecting a removal whose block is gone', async () => {
    const fixture = await createComponent({
      kind: 'block_delete',
      id: 's2',
      summary: null,
      blockId: 'gone',
      targetTitle: 'Ancien',
    });
    expect(el(fixture).querySelector('.structure-review__missing')).not.toBeNull();
    expect(acceptButton(fixture).disabled).toBe(true);
  });

  it('lists the proposed order and marks the moved blocks', async () => {
    const fixture = await createComponent({
      kind: 'blocks_reorder',
      id: 's3',
      summary: null,
      blockIds: ['b-3', 'b-1', 'b-2'],
    });
    const rows = [...el(fixture).querySelectorAll('.structure-review__row')];
    expect(
      rows.map((row) => row.querySelector('.structure-review__name')?.textContent?.trim()),
    ).toEqual(['Bilan', 'Intro', 'Cours']);
    expect(rows.every((row) => row.classList.contains('structure-review__row--moved'))).toBe(true);
    expect(rows[0].textContent).toContain('position 3');
  });

  it('only allows rejecting an order that no longer matches the course', async () => {
    const fixture = await createComponent({
      kind: 'blocks_reorder',
      id: 's3',
      summary: null,
      blockIds: ['b-3', 'b-1'],
    });
    expect(el(fixture).querySelector('.structure-review__missing')).not.toBeNull();
    expect(acceptButton(fixture).disabled).toBe(true);
  });

  it('relays the decision with its comment', async () => {
    const fixture = await createComponent({
      kind: 'blocks_reorder',
      id: 's3',
      summary: null,
      blockIds: ['b-2', 'b-1', 'b-3'],
    });
    const accepted = vi.fn();
    fixture.componentInstance.accepted.subscribe(accepted);
    acceptButton(fixture).click();
    expect(accepted).toHaveBeenCalledWith('');
  });
});
