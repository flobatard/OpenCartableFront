import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { MODULE_LIBRARY_FETCH } from './module-library-loader';
import { ModuleRunner } from './module-runner';

/** Lectures de librairies en attente, résolues à la main par les tests. */
interface PendingRead {
  readonly url: string;
  readonly resolve: (text: string) => void;
  readonly reject: (error: Error) => void;
}

describe('ModuleRunner', () => {
  let pending: PendingRead[];
  let fixture: ComponentFixture<ModuleRunner>;

  beforeEach(() => {
    pending = [];
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        {
          provide: MODULE_LIBRARY_FETCH,
          useValue: (url: string) =>
            new Promise<string>((resolve, reject) => pending.push({ url, resolve, reject })),
        },
      ],
    });
    fixture = TestBed.createComponent(ModuleRunner);
  });

  const render = (js: string): void => {
    fixture.componentRef.setInput('js', js);
    fixture.detectChanges();
  };
  const srcdoc = (): string =>
    (fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement).srcdoc;
  /** Chaîne de promesses du loader (hors tâches suivies par Angular) : une macrotâche la vide. */
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };

  it('composes synchronously, without reading anything, when no library is declared', () => {
    render("document.body.dataset.go = '1';");

    expect(srcdoc()).toContain("document.body.dataset.go = '1';");
    expect(pending).toEqual([]);
  });

  it('inlines the declared libraries once they are read, before the teacher’s JS', async () => {
    render('// @oc-libs: matter\nMatter.Engine.create();');
    expect(pending.map((read) => read.url)).toEqual(['/assets/module-libs/matter.js']);
    expect(srcdoc()).toBe('');

    pending[0].resolve('window.Matter = {};');
    await settle();

    const doc = srcdoc();
    expect(doc.indexOf('window.Matter = {};')).toBeGreaterThan(-1);
    expect(doc.indexOf('window.Matter = {};')).toBeLessThan(doc.indexOf('Matter.Engine.create();'));
    expect(fixture.nativeElement.querySelector('.module-runner__error')).toBeNull();
  });

  it('never lets a late read overwrite newer code', async () => {
    render('// @oc-libs: p5\nfirst();');
    render('second();');
    expect(srcdoc()).toContain('second();');

    pending[0].resolve('window.p5 = function () {};');
    await settle();

    expect(srcdoc()).toContain('second();');
    expect(srcdoc()).not.toContain('first();');
  });

  it('runs the module without its libraries and says so when a read fails', async () => {
    render('// @oc-libs: chart\nnew Chart();');
    pending[0].reject(new Error('offline'));
    await settle();

    expect(srcdoc()).toContain('new Chart();');
    expect(fixture.nativeElement.querySelector('.module-runner__error')?.textContent).toContain(
      'bibliothèque',
    );
  });
});
