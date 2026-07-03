import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Header } from './header';
import { AuthService } from '../../core/auth/auth.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('Header', () => {
  const isAuthenticated = signal(false);
  const displayName = signal<string | null>(null);
  const authMock = {
    isAuthenticated,
    displayName,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    isAuthenticated.set(false);
    displayName.set(null);
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

  it('bascule le thème au clic', async () => {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();

    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.header__theme',
    );
    toggle?.click();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('change la langue de l’interface au clic', async () => {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const enButton = Array.from(el.querySelectorAll<HTMLButtonElement>('.header__lang')).find(
      (b) => b.textContent?.trim() === 'EN',
    );
    enButton?.click();
    await fixture.whenStable();

    expect(el.textContent).toContain('Sign in');
  });

  it('affiche le nom du prof et la déconnexion une fois authentifié', async () => {
    isAuthenticated.set(true);
    displayName.set('Prof');

    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Prof');
    expect(el.textContent).toContain('Se déconnecter');
    expect(el.textContent).not.toContain('Se connecter');
  });
});
