import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { UserMenu } from './user-menu';
import { AuthService } from '../../core/auth/auth.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('UserMenu', () => {
  const displayName = signal<string | null>('Prof');
  const authMock = {
    isAuthenticated: signal(true),
    displayName,
    logout: vi.fn().mockResolvedValue(undefined),
  };

  async function createComponent(): Promise<ComponentFixture<UserMenu>> {
    await TestBed.configureTestingModule({
      imports: [UserMenu, provideTranslocoTesting()],
      providers: [provideRouter([]), { provide: AuthService, useValue: authMock }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(UserMenu);
    await fixture.whenStable();
    return fixture;
  }

  function el(fixture: ComponentFixture<UserMenu>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function trigger(fixture: ComponentFixture<UserMenu>): HTMLButtonElement {
    return el(fixture).querySelector<HTMLButtonElement>('.user-menu__trigger')!;
  }

  function items(fixture: ComponentFixture<UserMenu>): HTMLElement[] {
    return [...el(fixture).querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  async function openMenu(fixture: ComponentFixture<UserMenu>): Promise<void> {
    trigger(fixture).click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    displayName.set('Prof');
    vi.clearAllMocks();
  });

  it('fermé par défaut : affiche le nom, pas de menu dans le DOM', async () => {
    const fixture = await createComponent();

    expect(trigger(fixture).textContent).toContain('Prof');
    expect(trigger(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(el(fixture).querySelector('[role="menu"]')).toBeNull();
  });

  it('le clic ouvre le menu avec « Mon profil » et « Se déconnecter »', async () => {
    const fixture = await createComponent();
    await openMenu(fixture);

    expect(trigger(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(items(fixture).map((i) => i.textContent?.trim())).toEqual([
      'Mon profil',
      'Se déconnecter',
    ]);
  });

  it('le lien « Mon profil » pointe vers /fr/profile et ferme le menu', async () => {
    const fixture = await createComponent();
    await openMenu(fixture);

    const link = items(fixture)[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/fr/profile');

    link.click();
    await fixture.whenStable();
    expect(el(fixture).querySelector('[role="menu"]')).toBeNull();
  });

  it('« Se déconnecter » appelle logout et ferme le menu', async () => {
    const fixture = await createComponent();
    await openMenu(fixture);

    items(fixture)[1].click();
    await fixture.whenStable();

    expect(authMock.logout).toHaveBeenCalled();
    expect(el(fixture).querySelector('[role="menu"]')).toBeNull();
  });

  it('Escape ferme le menu et rend le focus au déclencheur', async () => {
    const fixture = await createComponent();
    await openMenu(fixture);

    items(fixture)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await fixture.whenStable();

    expect(el(fixture).querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger(fixture));
  });

  it('un focus sortant du composant ferme le menu', async () => {
    const fixture = await createComponent();
    await openMenu(fixture);

    el(fixture)
      .querySelector('.user-menu')!
      .dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body, bubbles: true }));
    await fixture.whenStable();

    expect(el(fixture).querySelector('[role="menu"]')).toBeNull();
  });

  it('ArrowDown sur le déclencheur ouvre et focalise le premier item', async () => {
    const fixture = await createComponent();

    trigger(fixture).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    await fixture.whenStable();

    expect(el(fixture).querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).toBe(items(fixture)[0]);
  });

  it('les flèches cyclent entre les items', async () => {
    const fixture = await createComponent();
    await openMenu(fixture);
    items(fixture)[0].focus();

    items(fixture)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(items(fixture)[1]);

    items(fixture)[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(items(fixture)[0]);
  });
});
