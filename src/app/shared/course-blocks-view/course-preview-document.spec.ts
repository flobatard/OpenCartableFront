import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseResource } from '../../core/resources/resource.model';
import { ResourceService } from '../../core/resources/resource.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { CoursePreviewDocument } from './course-preview-document';

const IMAGE: CourseResource = {
  id: 'resource-2',
  type: 'image',
  original_name: 'illustration.png',
  size: 1_800_000,
  mime: 'image/png',
  status: 'available',
  created_at: '2026-07-04T09:00:00Z',
  updated_at: '2026-07-04T09:01:00Z',
};

const PDF: CourseResource = {
  id: 'resource-1',
  type: 'document',
  original_name: 'schema-suites.pdf',
  size: 245_000,
  mime: 'application/pdf',
  status: 'available',
  created_at: '2026-07-05T10:00:00Z',
  updated_at: '2026-07-05T10:05:00Z',
};

/** Document non-PDF : la carte téléchargeable reste son seul rendu. */
const ZIP: CourseResource = {
  id: 'resource-9',
  type: 'document',
  original_name: 'archives.zip',
  size: 3_000_000,
  mime: 'application/zip',
  status: 'available',
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-01T08:00:00Z',
};

describe('CoursePreviewDocument', () => {
  const getDownloadUrl = vi.fn().mockResolvedValue('https://s3.example/presigned');
  const resourcesMock = { getDownloadUrl };

  async function createComponent(
    resource: CourseResource | undefined,
    caption: string | null = null,
    display: 'inline' | 'download' = 'inline',
  ): Promise<ComponentFixture<CoursePreviewDocument>> {
    await TestBed.configureTestingModule({
      imports: [CoursePreviewDocument, provideTranslocoTesting()],
      providers: [{ provide: ResourceService, useValue: resourcesMock }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CoursePreviewDocument);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('resource', resource);
    fixture.componentRef.setInput('caption', caption);
    fixture.componentRef.setInput('display', display);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function el(fixture: ComponentFixture<CoursePreviewDocument>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => getDownloadUrl.mockClear());

  it('shows an image inline via the presigned URL', async () => {
    const fixture = await createComponent(IMAGE);
    // Forme d'appel historique : jamais de disposition pour les médias.
    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-2');
    const img = el(fixture).querySelector<HTMLImageElement>('img.course-preview-document__media');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('https://s3.example/presigned');
  });

  it('embeds a PDF in an iframe via the inline presigned URL', async () => {
    const fixture = await createComponent(PDF);
    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-1', 'inline');
    const iframe = el(fixture).querySelector<HTMLIFrameElement>(
      'iframe.course-preview-document__pdf',
    );
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('src')).toBe('https://s3.example/presigned');
    expect(iframe!.getAttribute('title')).toBe('schema-suites.pdf');
    expect(iframe!.getAttribute('data-oc-resource-id')).toBe('resource-1');
    // Jamais de sandbox : le viewer PDF natif ne s'y charge pas (cf. composant).
    expect(iframe!.hasAttribute('sandbox')).toBe(false);
    expect(el(fixture).querySelector('.course-preview-document__card')).toBeNull();
  });

  it('keeps the downloadable card for a PDF in download mode', async () => {
    const fixture = await createComponent(PDF, null, 'download');
    expect(getDownloadUrl).not.toHaveBeenCalled();
    expect(el(fixture).querySelector('iframe')).toBeNull();
    expect(el(fixture).querySelector('.course-preview-document__card')).toBeTruthy();
  });

  it('the PDF action row opens a tab (inline) and downloads (attachment)', async () => {
    const fixture = await createComponent(PDF);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const [openInTab, download] = el(fixture).querySelectorAll<HTMLButtonElement>(
      '.course-preview-document__actions .btn',
    );

    getDownloadUrl.mockClear();
    openInTab.click();
    await fixture.whenStable();
    // URL fraîche re-présignée, jamais celle de l'iframe (TTL).
    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-1', 'inline');
    expect(open).toHaveBeenCalledWith('https://s3.example/presigned', '_blank', 'noopener');

    getDownloadUrl.mockClear();
    download.click();
    await fixture.whenStable();
    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-1');
    open.mockRestore();
  });

  it('falls back to the card with a message when the PDF presign fails', async () => {
    getDownloadUrl.mockRejectedValueOnce(new Error('presign failed'));
    const fixture = await createComponent(PDF);
    expect(el(fixture).querySelector('iframe')).toBeNull();
    expect(el(fixture).querySelector('.course-preview-document__card')).toBeTruthy();
    expect(el(fixture).querySelector('[role="alert"]')).toBeTruthy();
  });

  it('shows a downloadable card for a non-PDF document', async () => {
    const fixture = await createComponent(ZIP);
    // Pas de présignature en avance pour un document sans aperçu.
    expect(getDownloadUrl).not.toHaveBeenCalled();
    const card = el(fixture).querySelector('.course-preview-document__card');
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('archives.zip');
  });

  it('the download button opens the presigned URL with noopener', async () => {
    const fixture = await createComponent(ZIP);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    el(fixture).querySelector<HTMLButtonElement>('.course-preview-document__card .btn')!.click();
    await fixture.whenStable();

    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'resource-9');
    expect(open).toHaveBeenCalledWith('https://s3.example/presigned', '_blank', 'noopener');
    open.mockRestore();
  });

  it('shows the caption as a figcaption when present', async () => {
    const fixture = await createComponent(PDF, 'Schéma récapitulatif');
    expect(el(fixture).querySelector('.course-preview-document__caption')?.textContent).toContain(
      'Schéma récapitulatif',
    );
  });

  it('shows a message when the resource is not found', async () => {
    const fixture = await createComponent(undefined);
    expect(el(fixture).querySelector('.course-preview-document__missing')).toBeTruthy();
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });
});
