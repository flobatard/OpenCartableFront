import { describe, expect, it } from 'vitest';
import { staticHeaders, WORKER_CSP } from './static-headers';

const ROOT = '/app/dist/OpenCartableFront/browser';

describe('staticHeaders', () => {
  it('revalidates the unhashed runtimes instead of caching them for a year', () => {
    expect(staticHeaders(`${ROOT}/assets/sqljs/sql-wasm.wasm`)).toEqual({
      'Cache-Control': 'no-cache',
    });
    expect(staticHeaders(`${ROOT}/assets/pyodide/pyodide.asm.wasm`)).toEqual({
      'Cache-Control': 'no-cache',
    });
    expect(staticHeaders(`${ROOT}/assets/module-libs/p5.js`)).toEqual({
      'Cache-Control': 'no-cache',
    });
  });

  it('confines worker scripts to the origin (Angular chunks and the sql.js worker)', () => {
    expect(staticHeaders(`${ROOT}/worker-AB12CD34.js`)).toEqual({
      'Content-Security-Policy': WORKER_CSP,
    });
    expect(staticHeaders(`${ROOT}/assets/sqljs/worker.sql-wasm.js`)).toEqual({
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': WORKER_CSP,
    });
    expect(WORKER_CSP).toContain("connect-src 'self'");
    expect(WORKER_CSP).toContain("'wasm-unsafe-eval'");
  });

  it('handles Windows separators', () => {
    expect(staticHeaders('C:\\dist\\browser\\assets\\sqljs\\worker.sql-wasm.js')).toHaveProperty(
      'Content-Security-Policy',
    );
  });

  it('leaves every other file alone', () => {
    for (const path of [
      `${ROOT}/main-ABCDEFGH.js`,
      `${ROOT}/chunk-ABCDEFGH.js`,
      `${ROOT}/assets/tikzjax/tikzjax.js`,
      `${ROOT}/abcjs-soundfont/acoustic_grand_piano-mp3/C4.mp3`,
      `${ROOT}/networker-ABCDEFGH.js`,
    ]) {
      expect(staticHeaders(path)).toEqual({});
    }
  });
});
