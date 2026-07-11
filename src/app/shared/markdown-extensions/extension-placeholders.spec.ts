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
  it('détecte un fence d’un langage enregistré', () => {
    expect(hasMarkdownExtensions(fenceHtml('geogebra', 'id=a'), DEFS)).toBe(true);
  });

  it('ignore un HTML sans fence enregistré', () => {
    expect(hasMarkdownExtensions('<p>texte</p>', DEFS)).toBe(false);
    expect(hasMarkdownExtensions(fenceHtml('mermaid', 'graph TD'), DEFS)).toBe(false);
  });
});

describe('applyExtensionPlaceholders', () => {
  it('remplace le fence par un hôte portant langage, imprimabilité et source', () => {
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

  it('pose data-oc-printable="true" pour un langage imprimable', () => {
    const html = applyExtensionPlaceholders(fenceHtml('jsxgraph', 'point=2,2'), DEFS);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector(`[${EXTENSION_ATTR}]`)?.getAttribute(EXTENSION_PRINTABLE_ATTR)).toBe(
      'true',
    );
  });

  it('préserve la source aller-retour, y compris caractères HTML échappés', () => {
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

  it('ne touche ni un langage non enregistré ni mermaid', () => {
    const python = fenceHtml('python', 'print(1)');
    const mermaid = fenceHtml('mermaid', 'graph TD');
    expect(applyExtensionPlaceholders(python, DEFS)).toBe(python);
    expect(applyExtensionPlaceholders(mermaid, DEFS)).toBe(mermaid);
  });

  it('rend le HTML inchangé quand aucun fence ne matche', () => {
    const html = '<p>du texte</p>';
    expect(applyExtensionPlaceholders(html, DEFS)).toBe(html);
  });

  it('traite plusieurs fences, y compris de langages différents', () => {
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
