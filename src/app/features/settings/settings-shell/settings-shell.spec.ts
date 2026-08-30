import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { SettingsShell } from './settings-shell';

describe('SettingsShell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsShell, provideTranslocoTesting()],
      providers: [provideRouter([])],
    });
  });

  it('renders the side menu with the two subpages', async () => {
    const fixture = TestBed.createComponent(SettingsShell);
    await fixture.whenStable();

    const nav = fixture.nativeElement.querySelector('.settings-shell__nav') as HTMLElement;
    expect(nav).toBeTruthy();
    const links = Array.from(nav.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/profile', '/ai']);
  });

  it('carries a router-outlet for the subpages', async () => {
    const fixture = TestBed.createComponent(SettingsShell);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
