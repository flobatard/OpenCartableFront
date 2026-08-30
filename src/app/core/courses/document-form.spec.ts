import {
  buildDocumentForm,
  patchDocumentFormFromContent,
  payloadFromDocumentContent,
  payloadFromDocumentForm,
} from './document-form';

describe('payloadFromDocumentContent', () => {
  it('normalizes the default backend content', () => {
    expect(payloadFromDocumentContent({ caption: null, display: 'inline' })).toEqual({
      caption: null,
      display: 'inline',
    });
  });

  it('preserves a caption and a download display', () => {
    expect(payloadFromDocumentContent({ caption: 'Figure 1', display: 'download' })).toEqual({
      caption: 'Figure 1',
      display: 'download',
    });
  });

  it('falls back for absent or unknown values (empty content, exotic display)', () => {
    expect(payloadFromDocumentContent({})).toEqual({ caption: null, display: 'inline' });
    expect(payloadFromDocumentContent({ caption: '', display: 'popup' })).toEqual({
      caption: null,
      display: 'inline',
    });
    expect(payloadFromDocumentContent({ caption: 42 })).toEqual({
      caption: null,
      display: 'inline',
    });
  });
});

describe('payloadFromDocumentForm', () => {
  it('trims the caption and turns an empty one into null', () => {
    const form = buildDocumentForm();
    form.controls.caption.setValue('  Figure 1  ');
    form.controls.display.setValue('download');
    expect(payloadFromDocumentForm(form)).toEqual({
      caption: 'Figure 1',
      display: 'download',
    });

    form.controls.caption.setValue('   ');
    expect(payloadFromDocumentForm(form)).toEqual({
      caption: null,
      display: 'download',
    });
  });
});

describe('patchDocumentFormFromContent', () => {
  it('prefills without emitting (the parent autosave must not fire)', () => {
    const form = buildDocumentForm();
    const emissions = vi.fn();
    form.valueChanges.subscribe(emissions);

    patchDocumentFormFromContent(form, { caption: 'Schéma', display: 'download' });

    expect(form.getRawValue()).toEqual({ caption: 'Schéma', display: 'download' });
    expect(emissions).not.toHaveBeenCalled();
  });

  it('maps a null caption to an empty field', () => {
    const form = buildDocumentForm();
    patchDocumentFormFromContent(form, { caption: null, display: 'inline' });
    expect(form.getRawValue()).toEqual({ caption: '', display: 'inline' });
  });
});
