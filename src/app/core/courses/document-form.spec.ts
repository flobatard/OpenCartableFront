import {
  buildDocumentForm,
  patchDocumentFormFromContent,
  payloadFromDocumentContent,
  payloadFromDocumentForm,
} from './document-form';

describe('payloadFromDocumentContent', () => {
  it('normalise le content par défaut du back', () => {
    expect(payloadFromDocumentContent({ legende: null, affichage: 'inline' })).toEqual({
      legende: null,
      affichage: 'inline',
    });
  });

  it('préserve une légende et un affichage téléchargement', () => {
    expect(
      payloadFromDocumentContent({ legende: 'Figure 1', affichage: 'telechargement' }),
    ).toEqual({ legende: 'Figure 1', affichage: 'telechargement' });
  });

  it('replie les valeurs absentes ou inconnues (content vide, affichage exotique)', () => {
    expect(payloadFromDocumentContent({})).toEqual({ legende: null, affichage: 'inline' });
    expect(payloadFromDocumentContent({ legende: '', affichage: 'popup' })).toEqual({
      legende: null,
      affichage: 'inline',
    });
    expect(payloadFromDocumentContent({ legende: 42 })).toEqual({
      legende: null,
      affichage: 'inline',
    });
  });
});

describe('payloadFromDocumentForm', () => {
  it('trime la légende et vide → null', () => {
    const form = buildDocumentForm();
    form.controls.legende.setValue('  Figure 1  ');
    form.controls.affichage.setValue('telechargement');
    expect(payloadFromDocumentForm(form)).toEqual({
      legende: 'Figure 1',
      affichage: 'telechargement',
    });

    form.controls.legende.setValue('   ');
    expect(payloadFromDocumentForm(form)).toEqual({
      legende: null,
      affichage: 'telechargement',
    });
  });
});

describe('patchDocumentFormFromContent', () => {
  it('pré-remplit sans émettre (l’autosave du parent ne doit pas se déclencher)', () => {
    const form = buildDocumentForm();
    const emissions = vi.fn();
    form.valueChanges.subscribe(emissions);

    patchDocumentFormFromContent(form, { legende: 'Schéma', affichage: 'telechargement' });

    expect(form.getRawValue()).toEqual({ legende: 'Schéma', affichage: 'telechargement' });
    expect(emissions).not.toHaveBeenCalled();
  });

  it('replie une légende null sur le champ vide', () => {
    const form = buildDocumentForm();
    patchDocumentFormFromContent(form, { legende: null, affichage: 'inline' });
    expect(form.getRawValue()).toEqual({ legende: '', affichage: 'inline' });
  });
});
