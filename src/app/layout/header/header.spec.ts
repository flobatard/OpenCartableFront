import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Header } from './header';
import { AuthService } from '../../core/auth/auth.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('Header', () => {
  const isAuthenticated = signal(false);
  const displayName = signal<string | null>(null);
  const loggingIn = signal(false);
  const authMock = {
    isAuthenticated,
    displayName,
    loggingIn,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    isAuthenticated.set(false);
    displayName.set(null);
    loggingIn.set(false);
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    await TestBed.configureTestingModule({
      imports: [Header, provideTranslocoTesting()],
      providers: [provideRouter([]), { provide: AuthService, useValue: authMock }],
    }).compileComponents();
  });

  it('affiche le logo et le bouton de connexion', async () => {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('img[alt="OpenCartable"]')).toBeTruthy();
    expect(el.textContent).toContain('Se connecter');
  });

  it('affiche un spinner et désactive le bouton pendant la connexion', async () => {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('.header__actions .btn--secondary');

    expect(button?.querySelector('app-spinner')).toBeNull();

    loggingIn.set(true);
    fixture.detectChanges();

    expect(button?.disabled).toBe(true);
    expect(button?.querySelector('app-spinner')).toBeTruthy();
  });

  it('bascule le thème au clic', async () => {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();

    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.header__theme',
    );
    toggle?.click();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('navigue vers la même page dans l’autre langue au clic et mémorise le choix', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/fr/home');

    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const enButton = Array.from(el.querySelectorAll<HTMLButtonElement>('.header__lang')).find(
      (b) => b.textContent?.trim() === 'EN',
    );
    enButton?.click();

    expect(navigate).toHaveBeenCalledWith(['/', 'en', 'home']);
    expect(localStorage.getItem('oc-lang')).toBe('en');
  });

  it('masque la nav prof pour les visiteurs', async () => {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.header__nav')).toBeNull();
  });

  it('affiche le lien « Mes cours » une fois authentifié', async () => {
    isAuthenticated.set(true);
    displayName.set('Prof');

    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.header__nav-link',
    );

    expect(link?.textContent).toContain('Mes cours');
    expect(link?.getAttribute('href')).toBe('/fr/courses');
  });

  it('affiche le menu utilisateur une fois authentifié', async () => {
    isAuthenticated.set(true);
    displayName.set('Prof');

    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const trigger = el.querySelector<HTMLButtonElement>('.user-menu__trigger');
    expect(trigger?.textContent).toContain('Prof');
    expect(el.textContent).not.toContain('Se connecter');
    // La déconnexion vit dans le menu, fermé par défaut.
    expect(el.textContent).not.toContain('Se déconnecter');

    trigger?.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Mon profil');
    expect(el.textContent).toContain('Se déconnecter');
  });
});
