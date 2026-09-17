import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TargetApplier, TargetApplierRegistry } from './target-applier.registry';

function applier(): TargetApplier {
  return { apply: vi.fn(() => true), flush: vi.fn().mockResolvedValue(undefined) };
}

describe('TargetApplierRegistry', () => {
  it('serves the applier registered for a target, null otherwise', () => {
    const registry = TestBed.inject(TargetApplierRegistry);
    const block = applier();
    registry.register('b1', block);
    expect(registry.get('b1')).toBe(block);
    expect(registry.get('b2')).toBeNull();
  });

  it('the unregister function only removes its own applier', () => {
    const registry = TestBed.inject(TargetApplierRegistry);
    const first = applier();
    const second = applier();
    const unregisterFirst = registry.register('b1', first);
    // Remontage de l'éditeur (RouteReuseStrategy) : le nouveau remplace l'ancien…
    registry.register('b1', second);
    // …et le retrait tardif de l'ancien ne retire pas le nouveau.
    unregisterFirst();
    expect(registry.get('b1')).toBe(second);
  });
});
