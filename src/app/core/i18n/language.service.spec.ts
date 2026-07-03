import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from './language.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'fr';
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
    });
  });

  it('utilise la langue du navigateur quand rien n’est persisté', () => {
    // jsdom expose navigator.language = 'en-US'
    const service = TestBed.inject(LanguageService);
    service.init();
    expect(service.lang()).toBe('en');
  });

  it('restaure la langue persistée', () => {
    localStorage.setItem('oc-lang', 'en');
    const service = TestBed.inject(LanguageService);
    service.init();
    expect(service.lang()).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('change de langue et persiste le choix', () => {
    const service = TestBed.inject(LanguageService);
    service.setLang('en');
    expect(service.lang()).toBe('en');
    expect(localStorage.getItem('oc-lang')).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignore une valeur persistée invalide et retombe sur la langue du navigateur', () => {
    localStorage.setItem('oc-lang', 'de');
    const service = TestBed.inject(LanguageService);
    service.init();
    expect(service.lang()).toBe('en');
  });
});
