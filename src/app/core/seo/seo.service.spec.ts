import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { SeoService } from './seo.service';
import { LanguageService } from '../i18n/language.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('SeoService', () => {
  beforeEach(() => {
    document.documentElement.lang = 'fr';
    document.head
      .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
      .forEach((link) => link.remove());
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideRouter([])],
    });
  });

  it('pose title, description, canonical et hreflang pour la langue active', () => {
    TestBed.inject(LanguageService).activate('en');
    TestBed.inject(SeoService).applyHome();

    expect(TestBed.inject(Title).getTitle()).toContain('compose');
    expect(TestBed.inject(Meta).getTag('name="description"')?.content).toContain('self-hosted');

    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('http://localhost:4200/en/home');

    const altFr = document.head.querySelector('link[rel="alternate"][hreflang="fr"]');
    expect(altFr?.getAttribute('href')).toBe('http://localhost:4200/fr/home');

    const xDefault = document.head.querySelector('link[rel="alternate"][hreflang="x-default"]');
    expect(xDefault?.getAttribute('href')).toBe('http://localhost:4200/fr/home');
  });

  it('n’ajoute pas de doublon de canonical au réappel', () => {
    const seo = TestBed.inject(SeoService);
    seo.applyHome();
    seo.applyHome();
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
  });
});
