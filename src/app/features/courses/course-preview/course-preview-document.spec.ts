import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseResource } from '../../../core/resources/resource.model';
import { ResourceService } from '../../../core/resources/resource.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CoursePreviewDocument } from './course-preview-document';

const IMAGE: CourseResource = {
  id: 'resource-2',
  type: 'image',
  nom_original: 'illustration.png',
  taille: 1_800_000,
  mime: 'image/png',
  statut: 'disponible',
  created_at: '2026-07-04T09:00:00Z',
  updated_at: '2026-07-04T09:01:00Z',
};

const PDF: CourseResource = {
  id: 'resource-1',
  type: 'document',
  nom_original: 'schema-suites.pdf',
  taille: 245_000,
  mime: 'application/pdf',
  statut: 'disponible',
  created_at: '2026-07-05T10:00:00Z',
  updated_at: '2026-07-05T10:05:00Z',
};

describe('CoursePreviewDocument', () => {
  const getDownloadUrl = vi.fn().mockResolvedValue('https://s3.example/presigned');
  const resourcesMock = { getDownloadUrl };

  async function createComponent(
    resource: CourseResource | undefined,
    legende: string | null = null,
  ): Promise<ComponentFixture<CoursePreviewDocument>> {
    await TestBed.configureTestingModule({
      imports: [CoursePreviewDocument, provideTranslocoTesting()],
      providers: [{ provide: ResourceService, useValue: resourcesMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CoursePreviewDocument);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('resource', resource);
    fixture.componentRef.setInput('legende', legende);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<CoursePreviewDocument>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => getDownloadUrl.mockClear());

  it('affiche une image en ligne via l’URL présignée', async () => {
    const fixture = await createComponent(IMAGE);
    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-2');
    const img = el(fixture).querySelector<HTMLImageElement>('img.course-preview-document__media');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('https://s3.example/presigned');
  });

  it('affiche une carte téléchargeable pour un document (PDF)', async () => {
    const fixture = await createComponent(PDF);
    // Pas de présignature en avance pour un document.
    expect(getDownloadUrl).not.toHaveBeenCalled();
    const card = el(fixture).querySelector('.course-preview-document__card');
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('schema-suites.pdf');
  });

  it('le bouton de téléchargement ouvre l’URL présignée avec noopener', async () => {
    const fixture = await createComponent(PDF);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    el(fixture).querySelector<HTMLButtonElement>('.course-preview-document__card .btn')!.click();
    await fixture.whenStable();

    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-1');
    expect(open).toHaveBeenCalledWith('https://s3.example/presigned', '_blank', 'noopener');
    open.mockRestore();
  });

  it('affiche la légende en figcaption quand présente', async () => {
    const fixture = await createComponent(PDF, 'Schéma récapitulatif');
    expect(el(fixture).querySelector('.course-preview-document__caption')?.textContent).toContain(
      'Schéma récapitulatif',
    );
  });

  it('affiche un message quand la ressource est introuvable', async () => {
    const fixture = await createComponent(undefined);
    expect(el(fixture).querySelector('.course-preview-document__missing')).toBeTruthy();
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });
});
