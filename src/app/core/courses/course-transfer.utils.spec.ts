import { courseExportFilename, downloadBlob } from './course-transfer.utils';

describe('courseExportFilename', () => {
  it('slugifie le titre (accents aplatis, caractères sûrs, minuscules)', () => {
    expect(courseExportFilename('Éléments de Géométrie !')).toBe(
      'cours-elements-de-geometrie.zip',
    );
  });

  it('préserve chiffres, points, tirets et underscores', () => {
    expect(courseExportFilename('Chap. 2 — suites_v1')).toBe('cours-chap.-2-suites_v1.zip');
  });

  it('replie sur « export » un titre sans caractère exploitable', () => {
    expect(courseExportFilename('« ??? »')).toBe('cours-export.zip');
  });
});

describe('downloadBlob', () => {
  it('crée un <a download>, clique et révoque l’URL objet', () => {
    // jsdom n'implémente pas createObjectURL : stub explicite.
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const blob = new Blob(['zip'], { type: 'application/zip' });
    downloadBlob(blob, 'cours-fractions.zip');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    // Le lien ne reste pas dans le DOM.
    expect(document.querySelector('a[download]')).toBeNull();

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
