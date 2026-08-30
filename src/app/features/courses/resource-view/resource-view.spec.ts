import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ResourceService } from '../../../core/resources/resource.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { ResourceView } from './resource-view';

describe('ResourceView', () => {
  let getDownloadUrl: ReturnType<typeof vi.fn>;
  let redirectTo: ReturnType<typeof vi.fn>;

  // Le composant est créé sans ngOnInit (appelé manuellement par les tests) :
  // l'espion sur `redirectTo` (indirection de location.replace, non
  // espionnable en jsdom) doit être posé avant le déclenchement.
  function createFixture(): ComponentFixture<ResourceView> {
    TestBed.configureTestingModule({
      imports: [ResourceView, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: ResourceService, useValue: { getDownloadUrl } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c1', resourceId: 'r1' }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(ResourceView);
    redirectTo = vi
      .spyOn(fixture.componentInstance, 'redirectTo')
      .mockImplementation(() => undefined) as ReturnType<typeof vi.fn>;
    return fixture;
  }

  async function createComponent(): Promise<ComponentFixture<ResourceView>> {
    const fixture = createFixture();
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    return fixture;
  }

  function httpError(status: number): HttpErrorResponse {
    return new HttpErrorResponse({ status });
  }

  beforeEach(() => {
    getDownloadUrl = vi.fn().mockResolvedValue('https://s3.test/get/uuid/schema.pdf');
  });

  it('presigns inline then redirects the browser to the S3 URL', async () => {
    await createComponent();

    expect(getDownloadUrl).toHaveBeenCalledWith('c1', 'r1', 'inline');
    expect(redirectTo).toHaveBeenCalledWith('https://s3.test/get/uuid/schema.pdf');
  });

  it('shows the spinner while the presign is in flight', async () => {
    let resolve!: (url: string) => void;
    getDownloadUrl.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    const fixture = createFixture();
    const pending = fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-spinner')).not.toBeNull();
    resolve('https://s3.test/get/x');
    await pending;
  });

  it('404: resource not found (deleted), with a back-to-course link', async () => {
    getDownloadUrl.mockRejectedValue(httpError(404));
    const fixture = await createComponent();

    expect(fixture.componentInstance.error()).toBe('notFound');
    expect(redirectTo).not.toHaveBeenCalled();
    const back = fixture.nativeElement.querySelector('a');
    expect(back?.getAttribute('href')).toBe('/fr/courses/c1');
  });

  it('409: resource not available (upload not confirmed)', async () => {
    getDownloadUrl.mockRejectedValue(httpError(409));
    const fixture = await createComponent();

    expect(fixture.componentInstance.error()).toBe('unavailable');
  });

  it('network error: generic message', async () => {
    getDownloadUrl.mockRejectedValue(new Error('down'));
    const fixture = await createComponent();

    expect(fixture.componentInstance.error()).toBe('error');
    expect(redirectTo).not.toHaveBeenCalled();
  });
});
