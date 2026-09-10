import { describe, expect, it } from 'vitest';
import { abcTitle, stripMidiDirectives } from './abc-config';

describe('stripMidiDirectives', () => {
  it('removes MIDI directive lines, whatever their instrument', () => {
    const source = [
      'X:1',
      '%%MIDI program 40',
      'T:Au clair de la lune',
      '  %%midi channel 10',
      'I: MIDI drum dddd 76 77',
      'K:C',
      'CCCD E2D2|',
    ].join('\n');
    expect(stripMidiDirectives(source)).toBe('X:1\nT:Au clair de la lune\nK:C\nCCCD E2D2|');
  });

  it('removes inline [I:MIDI …] fields but keeps the notes around them', () => {
    expect(stripMidiDirectives('CDEF [I:MIDI program 71] GABc|')).toBe('CDEF  GABc|');
  });

  it('leaves ordinary comments and fields untouched', () => {
    const source = '%%titlefont Arial 18\n% un commentaire\nM:4/4\nK:G\nGABc|';
    expect(stripMidiDirectives(source)).toBe(source);
  });
});

describe('abcTitle', () => {
  it('returns the first T: field', () => {
    expect(abcTitle('X:1\nT: Frère Jacques \nT:Sous-titre\nK:F')).toBe('Frère Jacques');
    expect(abcTitle('X:1\nK:C\nCDE|')).toBeNull();
  });
});
