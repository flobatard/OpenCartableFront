import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourcePreviewDialog } from './resource-preview-dialog';
import { CourseResource } from '../../core/resources/resource.model';
import { ResourceService } from '../../core/resources/resource.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

function resource(over: Partial<CourseResource> = {}): CourseResource {
  return {
    id: 'r-1',
    type: 'image',
    original_name: 'Photo.png',
    size: 1000,
    mime: 'image/png',
    status: 'available',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('ResourcePreviewDialog', () => {
  // L'embed délégué (CoursePreviewDocument) présigne via le résolveur prof.
  const getDownloadUrl = vi.fn().mockResolvedValue('https://s3.example/presigned');

  async function createComponent(): Promise<ComponentFixture<ResourcePreviewDialog>> {
    await TestBed.configureTestingModule({
      imports: [ResourcePreviewDialog, provideTranslocoTesting()],
      providers: [{ provide: ResourceService, useValue: { getDownloadUrl } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ResourcePreviewDialog);
    fixture.componentRef.setInput('courseId', 'course-1');
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<ResourcePreviewDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  beforeEach(() => getDownloadUrl.mockClear());

  it('open(resource) shows the dialog, the name as title, and mounts the embed', async () => {
    const fixture = await createComponent();
    const showModal = (dialog(fixture).showModal = vi.fn());

    fixture.componentInstance.open(resource());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog(fixture).querySelector('.res-preview__title')?.textContent).toContain(
      'Photo.png',
    );
    expect(dialog(fixture).querySelector('app-course-preview-document')).toBeTruthy();
    expect(getDownloadUrl).toHaveBeenCalledWith('course-1', 'r-1');
  });

  it('the close event unmounts the embed (fresh URL on reopen)', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    fixture.componentInstance.open(resource());
    fixture.detectChanges();

    dialog(fixture).dispatchEvent(new Event('close'));
    fixture.detectChanges();

    expect(dialog(fixture).querySelector('app-course-preview-document')).toBeNull();
  });

  it('close() drives the <dialog> and a backdrop click closes', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.close();
    dialog(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(close).toHaveBeenCalledTimes(2);
  });
});
