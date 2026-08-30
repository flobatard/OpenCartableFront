import {
  clampFrameHeight,
  composeModuleDocument,
  MODULE_CSP,
  MODULE_FRAME_MAX_HEIGHT,
  MODULE_FRAME_MIN_HEIGHT,
  parseModuleMessage,
} from './module-document';

describe('composeModuleDocument', () => {
  it('composes CSS in the head, HTML in the body, bridge BEFORE the teacher’s JS', () => {
    const doc = composeModuleDocument('<p>Salut</p>', 'p { color: red; }', "console.log('go')");
    const cssIdx = doc.indexOf('p { color: red; }');
    const htmlIdx = doc.indexOf('<p>Salut</p>');
    const bridgeIdx = doc.indexOf('ResizeObserver');
    const jsIdx = doc.indexOf("console.log('go')");

    expect(cssIdx).toBeGreaterThan(-1);
    // Ordre : css (head) < html (body) < bridge < js du prof.
    expect(cssIdx).toBeLessThan(htmlIdx);
    expect(htmlIdx).toBeLessThan(bridgeIdx);
    expect(bridgeIdx).toBeLessThan(jsIdx);
  });

  it('embeds the outbound-network-blocking CSP at the top of the head', () => {
    const doc = composeModuleDocument('<p>x</p>', 'p {}', 'let a = 1');
    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="${MODULE_CSP}">`);
    // Tous les canaux réseau silencieux sont coupés ; vivent le code inline
    // du module, l'eval d'expressions saisies (grapheurs — aucune capacité
    // nouvelle dans une iframe opaque sans réseau) et les assets data:/blob:.
    expect(MODULE_CSP).toContain("default-src 'none'");
    expect(MODULE_CSP).toContain("script-src 'unsafe-inline' 'unsafe-eval'");
    expect(MODULE_CSP).toContain("style-src 'unsafe-inline'");
    expect(MODULE_CSP).toContain("form-action 'none'");
    expect(MODULE_CSP).toContain('img-src data: blob:');
    // La CSP précède le <style> composé : elle gouverne tout ce qui suit.
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<style>'));
  });

  it('exposes the ocModule.emit API in the bridge', () => {
    const doc = composeModuleDocument('', '', '');
    expect(doc).toContain('window.ocModule');
    expect(doc).toContain('oc-module:resize');
    expect(doc).toContain('oc-module:event');
  });

  it('neutralizes </script> in the JS (composition does not break)', () => {
    const doc = composeModuleDocument('', '', "const s = '</script><img src=x onerror=alert(1)>';");
    // Le </script> littéral du code du prof ne ferme pas la balise composée :
    // il n'apparaît plus que sous forme échappée <\/script>.
    expect(doc).not.toContain("'</script>");
    expect(doc).toContain('<\\/script>');
  });

  it('neutralizes </style> in the CSS', () => {
    const doc = composeModuleDocument('', 'p::after { content: "</style>" }', '');
    expect(doc).not.toContain('content: "</style>"');
    expect(doc).toContain('<\\/style>');
  });
});

describe('clampFrameHeight', () => {
  it('clamps the height within [min, max] and rounds', () => {
    expect(clampFrameHeight(0)).toBe(MODULE_FRAME_MIN_HEIGHT);
    expect(clampFrameHeight(-50)).toBe(MODULE_FRAME_MIN_HEIGHT);
    expect(clampFrameHeight(500.6)).toBe(501);
    expect(clampFrameHeight(1_000_000)).toBe(MODULE_FRAME_MAX_HEIGHT);
  });
});

describe('parseModuleMessage', () => {
  it('accepts a well-formed resize', () => {
    expect(
      parseModuleMessage({ source: 'oc-module', type: 'oc-module:resize', payload: { height: 320 } }),
    ).toEqual({ type: 'resize', height: 320 });
  });

  it('accepts a named application event', () => {
    expect(
      parseModuleMessage({
        source: 'oc-module',
        type: 'oc-module:event',
        payload: { name: 'score', data: 42 },
      }),
    ).toEqual({ type: 'event', name: 'score', data: 42 });
  });

  it('rejects any foreign or malformed message', () => {
    expect(parseModuleMessage(null)).toBeNull();
    expect(parseModuleMessage('oc-module:resize')).toBeNull();
    expect(parseModuleMessage({ type: 'oc-module:resize', payload: { height: 10 } })).toBeNull();
    expect(parseModuleMessage({ source: 'autre', type: 'oc-module:resize' })).toBeNull();
    expect(parseModuleMessage({ source: 'oc-module', type: 'inconnu' })).toBeNull();
    // resize sans hauteur numérique finie.
    expect(
      parseModuleMessage({ source: 'oc-module', type: 'oc-module:resize', payload: {} }),
    ).toBeNull();
    expect(
      parseModuleMessage({
        source: 'oc-module',
        type: 'oc-module:resize',
        payload: { height: Infinity },
      }),
    ).toBeNull();
    // event sans nom.
    expect(
      parseModuleMessage({ source: 'oc-module', type: 'oc-module:event', payload: { name: '' } }),
    ).toBeNull();
  });
});
