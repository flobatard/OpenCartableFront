import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('reads the theme set by the anti-FOUC inline script', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
  });

  it('starts in light mode when no attribute is set', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');
  });

  it('toggles the theme, sets the attribute and persists the choice', () => {
    const service = TestBed.inject(ThemeService);

    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('oc-theme')).toBe('dark');

    service.toggle();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('oc-theme')).toBe('light');
  });
});
