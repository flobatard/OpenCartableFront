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

  it('shows the generic SVG fallback without a URL', () => {
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('svg.user-avatar__fallback')).not.toBeNull();
  });

  it("renders the image with the provided URL, decorative (empty alt)", () => {
    fixture.componentRef.setInput('url', 'https://s3.test/avatar.jpg');
    fixture.detectChanges();

    const img = host.querySelector<HTMLImageElement>('img.user-avatar__img');
    expect(img?.getAttribute('src')).toBe('https://s3.test/avatar.jpg');
    expect(img?.getAttribute('alt')).toBe('');
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('svg')).toBeNull();
  });

  it("falls back when the image fails (expired presigned URL)", () => {
    fixture.componentRef.setInput('url', 'https://s3.test/expired.jpg');
    fixture.detectChanges();

    host.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('svg.user-avatar__fallback')).not.toBeNull();
  });

  it("re-arms the image when the URL changes after an error", () => {
    fixture.componentRef.setInput('url', 'https://s3.test/expired.jpg');
    fixture.detectChanges();
    host.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.querySelector('img')).toBeNull();

    fixture.componentRef.setInput('url', 'https://s3.test/fresh.jpg');
    fixture.detectChanges();

    expect(host.querySelector('img')?.getAttribute('src')).toBe('https://s3.test/fresh.jpg');
  });

  it('applies the size class', () => {
    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    expect(host.classList).toContain('user-avatar--sm');
  });
});
