import { describe, expect, it } from 'vitest';
import {
  applyExtensionPlaceholders,
  EXTENSION_ATTR,
  EXTENSION_PRINTABLE_ATTR,
  hasMarkdownExtensions,
} from './extension-placeholders';

const DEFS = [
  { language: 'geogebra', isPrintable: false },
  { language: 'jsxgraph', isPrintable: true },
];

/** HTML tel que sorti de renderCourseMarkdown pour un fence `lang`. */
function fenceHtml(lang: string, escapedSource: string): string {
  return `<pre><code class="language-${lang}">${escapedSource}</code></pre>`;
}

describe('hasMarkdownExtensions', () => {
  it('detects a fence of a registered language', () => {
    expect(hasMarkdownExtensions(fenceHtml('geogebra', 'id=a'), DEFS)).toBe(true);
  });

  it('ignores HTML without a registered fence', () => {
    expect(hasMarkdownExtensions('<p>texte</p>', DEFS)).toBe(false);
    expect(hasMarkdownExtensions(fenceHtml('mermaid', 'graph TD'), DEFS)).toBe(false);
  });
});

describe('applyExtensionPlaceholders', () => {
  it('replaces the fence with a host carrying language, printability and source', () => {
    const html = applyExtensionPlaceholders(fenceHtml('geogebra', 'id=abc123\nwidth=600'), DEFS);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const host = doc.querySelector(`[${EXTENSION_ATTR}]`);
    expect(host).not.toBeNull();
    expect(host?.tagName).toBe('DIV');
    expect(host?.className).toBe('course-extension course-extension--pending');
    expect(host?.getAttribute(EXTENSION_ATTR)).toBe('geogebra');
    expect(host?.getAttribute(EXTENSION_PRINTABLE_ATTR)).toBe('false');
    expect(host?.textContent).toBe('id=abc123\nwidth=600');
    expect(doc.querySelector('pre')).toBeNull();
  });

  it('sets data-oc-printable="true" for a printable language', () => {
    const html = applyExtensionPlaceholders(fenceHtml('jsxgraph', 'point=2,2'), DEFS);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector(`[${EXTENSION_ATTR}]`)?.getAttribute(EXTENSION_PRINTABLE_ATTR)).toBe(
      'true',
    );
  });

  it('preserves the source round-trip, including escaped HTML characters', () => {
    // marked/DOMPurify échappent < et & dans le code ; textContent les décode,
    // la sérialisation les ré-échappe — la source lue au montage est intacte.
    const html = applyExtensionPlaceholders(
      fenceHtml('jsxgraph', 'equation="x^2 &lt; 4 &amp;&amp; x &gt; 0"'),
      DEFS,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector(`[${EXTENSION_ATTR}]`)?.textContent).toBe(
      'equation="x^2 < 4 && x > 0"',
    );
  });

  it('touches neither an unregistered language nor mermaid', () => {
    const python = fenceHtml('python', 'print(1)');
    const mermaid = fenceHtml('mermaid', 'graph TD');
    expect(applyExtensionPlaceholders(python, DEFS)).toBe(python);
    expect(applyExtensionPlaceholders(mermaid, DEFS)).toBe(mermaid);
  });

  it('returns the HTML unchanged when no fence matches', () => {
    const html = '<p>du texte</p>';
    expect(applyExtensionPlaceholders(html, DEFS)).toBe(html);
  });

  it('handles several fences, including of different languages', () => {
    const html = applyExtensionPlaceholders(
      fenceHtml('geogebra', 'id=a') + '<p>entre</p>' + fenceHtml('jsxgraph', 'point=1,1'),
      DEFS,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const hosts = doc.querySelectorAll(`[${EXTENSION_ATTR}]`);
    expect(hosts).toHaveLength(2);
    expect(hosts[0].getAttribute(EXTENSION_ATTR)).toBe('geogebra');
    expect(hosts[1].getAttribute(EXTENSION_ATTR)).toBe('jsxgraph');
    expect(doc.querySelector('p')?.textContent).toBe('entre');
  });
});
