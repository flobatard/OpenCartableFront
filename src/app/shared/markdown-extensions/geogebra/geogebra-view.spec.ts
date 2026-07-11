import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { GeogebraView } from './geogebra-view';

function createView(source: string) {
  const fixture = TestBed.createComponent(GeogebraView);
  fixture.componentRef.setInput('source', source);
  fixture.detectChanges();
  return fixture;
}

describe('GeogebraView', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });

  it('rend une iframe sandboxée vers le matériel pour un id valide', () => {
    const fixture = createView('id=RHYH3UQ8\nwidth=700');
    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    expect(iframe.src).toBe('https://www.geogebra.org/material/iframe/id/RHYH3UQ8');
    expect(iframe.getAttribute('width')).toBe('700');
    expect(iframe.getAttribute('height')).toBe('450');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(iframe.getAttribute('loading')).toBe('lazy');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('title')).toBeTruthy();
  });

  it('affiche la notice sans iframe pour un id invalide', () => {
    const fixture = createView('id=../evil');
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('.geogebra-view__error')).not.toBeNull();
  });

  it('réagit au changement de source', () => {
    const fixture = createView('width=600');
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    fixture.componentRef.setInput('source', 'id=abc123');
    fixture.detectChanges();
    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('/abc123');
  });
});
