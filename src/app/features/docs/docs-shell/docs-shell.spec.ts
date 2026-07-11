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

  it('rend un onglet par page (intégrés + extensions) avec le bon href', async () => {
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

  it('monte le composant de doc du slug via NgComponentOutlet', async () => {
    const fixture = setup('fakelang');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.fake-doc')).not.toBeNull();
  });

  it('affiche la notice pour un slug inconnu', async () => {
    const fixture = setup('inconnu');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.docs-shell__notice')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.fake-doc')).toBeNull();
  });

  it('change de composant quand le param de chemin change (paramMap observé)', async () => {
    const fixture = setup('fakelang');
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.fake-doc')).not.toBeNull();

    paramMap$.next(convertToParamMap({ slug: 'otherlang' }));
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.other-doc')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.fake-doc')).toBeNull();
  });

  it('affiche l’erreur si l’import du composant échoue', async () => {
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
