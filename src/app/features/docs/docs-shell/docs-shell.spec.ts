import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { MARKDOWN_EXTENSIONS } from '../../../shared/markdown-extensions/markdown-extension.model';
import { DocsShell } from './docs-shell';

@Component({ template: '<p class="fake-doc">contenu factice</p>' })
class FakeDoc {}

@Component({ template: '<p class="other-doc">autre doc</p>' })
class OtherDoc {}

/** Extension factice : sa doc est le composant FakeDoc (slug = language). */
const FAKE_DEF = {
  language: 'fakelang',
  isPrintable: true,
  loadComponent: () => Promise.reject(new Error('unused')),
  doc: { loadComponent: () => Promise.resolve(FakeDoc as Type<unknown>) },
};

const OTHER_DEF = {
  language: 'otherlang',
  isPrintable: true,
  loadComponent: () => Promise.reject(new Error('unused')),
  doc: { loadComponent: () => Promise.resolve(OtherDoc as Type<unknown>) },
};

describe('DocsShell', () => {
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function setup(slug: string) {
    paramMap$ = new BehaviorSubject(convertToParamMap({ slug }));
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: MARKDOWN_EXTENSIONS, useValue: FAKE_DEF, multi: true },
        { provide: MARKDOWN_EXTENSIONS, useValue: OTHER_DEF, multi: true },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            snapshot: { paramMap: convertToParamMap({ slug }) },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DocsShell);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  beforeEach(() => {
    // rien : setup par test (le slug initial varie).
  });

  it('renders one tab per page (built-ins + extensions) with the right href', async () => {
    const fixture = setup('katex');
    await settle(fixture);
    const links = [...fixture.nativeElement.querySelectorAll('.tabs a.tab')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/fr/markdown-language/docs/katex',
      '/fr/markdown-language/docs/mermaid',
      '/fr/markdown-language/docs/fakelang',
      '/fr/markdown-language/docs/otherlang',
    ]);
  });

  it('mounts the slug’s doc component via NgComponentOutlet', async () => {
    const fixture = setup('fakelang');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.fake-doc')).not.toBeNull();
  });

  it('shows the notice for an unknown slug', async () => {
    const fixture = setup('inconnu');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.docs-shell__notice')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.fake-doc')).toBeNull();
  });

  it('switches component when the path param changes (paramMap observed)', async () => {
    const fixture = setup('fakelang');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.fake-doc')).not.toBeNull();

    paramMap$.next(convertToParamMap({ slug: 'otherlang' }));
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.other-doc')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.fake-doc')).toBeNull();
  });

  it('shows the error when the component import fails', async () => {
    const broken = {
      ...FAKE_DEF,
      language: 'brokenlang',
      doc: { loadComponent: () => Promise.reject(new Error('offline')) },
    };
    paramMap$ = new BehaviorSubject(convertToParamMap({ slug: 'brokenlang' }));
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: MARKDOWN_EXTENSIONS, useValue: broken, multi: true },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            snapshot: { paramMap: convertToParamMap({ slug: 'brokenlang' }) },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DocsShell);
    fixture.detectChanges();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.docs-shell__notice')).not.toBeNull();
  });
});
