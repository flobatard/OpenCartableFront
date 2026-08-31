import { ActivatedRouteSnapshot, Route } from '@angular/router';
import {
  REMOUNT_ON_PARAM_CHANGE,
  RemountOnParamChangeStrategy,
} from './remount-on-param-change.strategy';

function snapshot(routeConfig: Route | null, params: Record<string, string>) {
  return { routeConfig, params } as unknown as ActivatedRouteSnapshot;
}

describe('RemountOnParamChangeStrategy', () => {
  const strategy = new RemountOnParamChangeStrategy();
  const flagged: Route = {
    path: 'courses/:id/blocks/:blockId',
    data: { [REMOUNT_ON_PARAM_CHANGE]: true },
  };
  const plain: Route = { path: 'p/courses/:courseId/blocks/:blockId' };

  it('keeps the default behavior for unflagged routes (instance reused across params)', () => {
    expect(
      strategy.shouldReuseRoute(snapshot(plain, { blockId: 'a' }), snapshot(plain, { blockId: 'b' })),
    ).toBe(true);
    expect(strategy.shouldReuseRoute(snapshot(plain, {}), snapshot(flagged, {}))).toBe(false);
  });

  it('remounts a flagged route when its params change (stale-snapshot guard)', () => {
    expect(
      strategy.shouldReuseRoute(
        snapshot(flagged, { id: 'c1', blockId: 'a' }),
        snapshot(flagged, { id: 'c1', blockId: 'b' }),
      ),
    ).toBe(false);
  });

  it('still reuses a flagged route when the params are identical (query params only)', () => {
    expect(
      strategy.shouldReuseRoute(
        snapshot(flagged, { id: 'c1', blockId: 'a' }),
        snapshot(flagged, { id: 'c1', blockId: 'a' }),
      ),
    ).toBe(true);
  });
});
