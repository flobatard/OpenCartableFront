import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { langGuard } from './lang.guard';
import { LanguageService } from './language.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

function runGuard(lang: string) {
  const route = { paramMap: convertToParamMap({ lang }) } as ActivatedRouteSnapshot;
  const state = { url: `/${lang}/home` } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => langGuard(route, state));
}

describe('langGuard', () => {
  beforeEach(() => {
    document.documentElement.lang = 'fr';
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideRouter([])],
    });
  });

  it('active la langue valide et autorise la route', async () => {
    const result = runGuard('en');
    expect(isObservable(result)).toBe(true);
    const allowed = await firstValueFrom(result as Observable<boolean>);
    expect(allowed).toBe(true);
    expect(TestBed.inject(LanguageService).lang()).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
  });

  it('redirige une langue inconnue vers /fr/home', () => {
    const result = runGuard('de');
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/fr/home');
  });
});
