import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AdminShell } from './admin-shell';

describe('AdminShell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminShell, provideTranslocoTesting()],
      providers: [provideRouter([])],
    });
  });

  it('renders the side menu with its single Jobs entry', async () => {
    const fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();

    const nav = fixture.nativeElement.querySelector('.admin-shell__nav') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe("Sections de l'administration");
    const links = Array.from(nav.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/jobs']);
    expect(links[0].textContent?.trim()).toBe('Jobs');
  });

  it('leaves the page heading to the subpage (no h1 in the shell)', async () => {
    const fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
