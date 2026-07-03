import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import {
  DEFAULT_LANG,
  isAppLang,
  langFromPath,
  LanguageService,
  resolveStoredOrBrowserLang,
} from './language.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'fr';
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideRouter([])],
    });
  });

  it('active une langue : signal, langue transloco et attribut <html lang>', () => {
    const service = TestBed.inject(LanguageService);
    service.activate('en');
    expect(service.lang()).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('mémorise le choix et navigue vers la même page dans l’autre langue', () => {
    const service = TestBed.inject(LanguageService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/fr/home');

    service.switchTo('en');

    expect(localStorage.getItem('oc-lang')).toBe('en');
    expect(navigate).toHaveBeenCalledWith(['/', 'en', 'home']);
  });

  it('switchTo depuis la racine cible /<lang>/home', () => {
    const service = TestBed.inject(LanguageService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/');

    service.switchTo('en');

    expect(navigate).toHaveBeenCalledWith(['/', 'en', 'home']);
  });
});

describe('helpers i18n', () => {
  it('isAppLang ne reconnaît que fr et en', () => {
    expect(isAppLang('fr')).toBe(true);
    expect(isAppLang('en')).toBe(true);
    expect(isAppLang('de')).toBe(false);
    expect(isAppLang(null)).toBe(false);
  });

  it('langFromPath lit le 1er segment, sinon défaut', () => {
    expect(langFromPath('/en/home')).toBe('en');
    expect(langFromPath('/fr/home')).toBe('fr');
    expect(langFromPath('/')).toBe(DEFAULT_LANG);
    expect(langFromPath('/de/home')).toBe(DEFAULT_LANG);
  });

  it('resolveStoredOrBrowserLang privilégie la préférence stockée', () => {
    localStorage.clear();
    localStorage.setItem('oc-lang', 'en');
    expect(resolveStoredOrBrowserLang()).toBe('en');
  });

  it('resolveStoredOrBrowserLang retombe sur la langue du navigateur', () => {
    localStorage.clear();
    // jsdom expose navigator.language = 'en-US'
    expect(resolveStoredOrBrowserLang()).toBe('en');
  });
});
