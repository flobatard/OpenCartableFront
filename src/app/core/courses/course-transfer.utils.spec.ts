import { courseExportFilename, downloadBlob } from './course-transfer.utils';

describe('courseExportFilename', () => {
  it('slugifies the title (accents flattened, safe characters, lowercase)', () => {
    expect(courseExportFilename('Éléments de Géométrie !')).toBe(
      'course-elements-de-geometrie.zip',
    );
  });

  it('preserves digits, dots, dashes and underscores', () => {
    expect(courseExportFilename('Chap. 2 — suites_v1')).toBe('course-chap.-2-suites_v1.zip');
  });

  it('falls back to "export" when no usable character remains', () => {
    expect(courseExportFilename('« ??? »')).toBe('course-export.zip');
  });
});

describe('downloadBlob', () => {
  it('creates an <a download>, clicks it and revokes the object URL', () => {
    // jsdom n'implémente pas createObjectURL : stub explicite.
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const blob = new Blob(['zip'], { type: 'application/zip' });
    downloadBlob(blob, 'course-fractions.zip');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    // Le lien ne reste pas dans le DOM.
    expect(document.querySelector('a[download]')).toBeNull();

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
