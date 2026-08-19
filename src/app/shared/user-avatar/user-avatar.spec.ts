import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserAvatar } from './user-avatar';

describe('UserAvatar', () => {
  let fixture: ComponentFixture<UserAvatar>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UserAvatar] });
    fixture = TestBed.createComponent(UserAvatar);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('affiche le repli SVG générique sans URL', () => {
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('svg.user-avatar__fallback')).not.toBeNull();
  });

  it("rend l'image avec l'URL fournie, décorative (alt vide)", () => {
    fixture.componentRef.setInput('url', 'https://s3.test/avatar.jpg');
    fixture.detectChanges();

    const img = host.querySelector<HTMLImageElement>('img.user-avatar__img');
    expect(img?.getAttribute('src')).toBe('https://s3.test/avatar.jpg');
    expect(img?.getAttribute('alt')).toBe('');
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('svg')).toBeNull();
  });

  it("bascule sur le repli quand l'image échoue (URL présignée expirée)", () => {
    fixture.componentRef.setInput('url', 'https://s3.test/expired.jpg');
    fixture.detectChanges();

    host.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('svg.user-avatar__fallback')).not.toBeNull();
  });

  it("réarme l'image quand l'URL change après une erreur", () => {
    fixture.componentRef.setInput('url', 'https://s3.test/expired.jpg');
    fixture.detectChanges();
    host.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.querySelector('img')).toBeNull();

    fixture.componentRef.setInput('url', 'https://s3.test/fresh.jpg');
    fixture.detectChanges();

    expect(host.querySelector('img')?.getAttribute('src')).toBe('https://s3.test/fresh.jpg');
  });

  it('applique la classe de taille', () => {
    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    expect(host.classList).toContain('user-avatar--sm');
  });
});
