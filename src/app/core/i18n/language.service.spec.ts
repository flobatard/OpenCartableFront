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

  it('activates a language: signal, transloco language and <html lang> attribute', () => {
    const service = TestBed.inject(LanguageService);
    service.activate('en');
    expect(service.lang()).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('remembers the choice and navigates to the same page in the other language', () => {
    const service = TestBed.inject(LanguageService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/fr/home');

    service.switchTo('en');

    expect(localStorage.getItem('oc-lang')).toBe('en');
    expect(navigate).toHaveBeenCalledWith(['/', 'en', 'home']);
  });

  it('switchTo from the root targets /<lang>/home', () => {
    const service = TestBed.inject(LanguageService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/');

    service.switchTo('en');

    expect(navigate).toHaveBeenCalledWith(['/', 'en', 'home']);
  });
});

describe('i18n helpers', () => {
  it('isAppLang only recognizes fr and en', () => {
    expect(isAppLang('fr')).toBe(true);
    expect(isAppLang('en')).toBe(true);
    expect(isAppLang('de')).toBe(false);
    expect(isAppLang(null)).toBe(false);
  });

  it('langFromPath reads the 1st segment, defaults otherwise', () => {
    expect(langFromPath('/en/home')).toBe('en');
    expect(langFromPath('/fr/home')).toBe('fr');
    expect(langFromPath('/')).toBe(DEFAULT_LANG);
    expect(langFromPath('/de/home')).toBe(DEFAULT_LANG);
  });

  it('resolveStoredOrBrowserLang favors the stored preference', () => {
    localStorage.clear();
    localStorage.setItem('oc-lang', 'en');
    expect(resolveStoredOrBrowserLang()).toBe('en');
  });

  it('resolveStoredOrBrowserLang falls back to the browser language', () => {
    localStorage.clear();
    // jsdom expose navigator.language = 'en-US'
    expect(resolveStoredOrBrowserLang()).toBe('en');
  });
});
