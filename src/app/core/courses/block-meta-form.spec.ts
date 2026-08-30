import {
  buildBlockMetaForm,
  patchBlockMetaForm,
  payloadFromBlockMetaForm,
} from './block-meta-form';
import { CourseBlock } from './course.model';

function block(over: Partial<CourseBlock> = {}): CourseBlock {
  return {
    id: 'block-1',
    position: 0,
    type: 'text',
    title: null,
    description: null,
    content: {},
    resource_id: null,
    module_id: null,
    ...over,
  };
}

describe('block-meta-form', () => {
  it('maps the form to the meta payload, trimming title and description', () => {
    const form = buildBlockMetaForm();
    form.setValue({ title: '  Mon titre  ', description: '  Ma description.  ' });

    expect(payloadFromBlockMetaForm(form)).toEqual({
      title: 'Mon titre',
      description: 'Ma description.',
    });
  });

  it('turns an empty or blank title or description into null', () => {
    const form = buildBlockMetaForm();
    form.setValue({ title: '   ', description: '' });

    expect(payloadFromBlockMetaForm(form)).toEqual({ title: null, description: null });
  });

  it('patchBlockMetaForm prefills from a block (null becomes empty string)', () => {
    const form = buildBlockMetaForm();

    patchBlockMetaForm(form, block({ title: 'Titre A', description: null }));
    expect(form.getRawValue()).toEqual({ title: 'Titre A', description: '' });
    // Le méta reflète le bloc : description absente → null.
    expect(payloadFromBlockMetaForm(form)).toEqual({ title: 'Titre A', description: null });
  });
});
