import { describe, expect, it } from 'vitest';
import { parsePassageConfig, PassageLine } from './passage-config';

const POEM = [
  'Demain, dès l’aube, à l’heure où blanchit la campagne,',
  'Je partirai. Vois-tu, je sais que tu m’attends.',
  'J’irai par la forêt, j’irai par la montagne.',
  'Je ne puis demeurer loin de toi plus longtemps.',
  '',
  'Je marcherai les yeux fixés sur mes pensées,',
  'Sans rien voir au dehors, sans entendre aucun bruit,',
].join('\n');

const lines = (source: string) =>
  parsePassageConfig(source).rows.filter((row): row is PassageLine => row.kind === 'line');

describe('parsePassageConfig', () => {
  it('numbers every non-blank line from 1, labelling each fifth one', () => {
    const config = parsePassageConfig(POEM);
    expect(config.rows.map((row) => (row.kind === 'line' ? row.number : 'gap'))).toEqual([
      1,
      2,
      3,
      4,
      'gap',
      5,
      6,
    ]);
    expect(
      lines(POEM)
        .filter((line) => line.labelled)
        .map((line) => line.number),
    ).toEqual([5]);
    expect(config.lastNumber).toBe(6);
  });

  it('keeps leading spaces (indented verse) and drops trailing ones', () => {
    const [first, second] = lines(
      'Maître Corbeau, sur un arbre perché,  \n    Tenait en son bec un fromage.\r',
    );
    expect(first.text).toBe('Maître Corbeau, sur un arbre perché,');
    expect(second.text).toBe('    Tenait en son bec un fromage.');
  });

  it('reads start= and step= at the top only; the rest is text', () => {
    const source = '\nstart=10\nstep = 2\n\nA ces mots\nle Corbeau\nstep=5\n';
    const config = parsePassageConfig(source);
    expect(lines(source).map((line) => [line.number, line.text, line.labelled])).toEqual([
      [10, 'A ces mots', true],
      [11, 'le Corbeau', false],
      [12, 'step=5', true],
    ]);
    expect(config.rows[0].kind).toBe('line'); // blancs de tête et d'après l'en-tête retirés
    expect(config.lastNumber).toBe(12);
  });

  it('out-of-range values keep the defaults', () => {
    const numbered = lines('start=0\nstep=0\nstep=101\nun\ndeux\ntrois\nquatre\ncinq');
    expect(numbered[0].number).toBe(1);
    expect(numbered.filter((line) => line.labelled).map((line) => line.number)).toEqual([5]);
  });

  it('blank lines inside the text are gaps, never counted; outer ones are dropped', () => {
    const config = parsePassageConfig('\n\nun\n\n\ndeux\n\n');
    expect(config.rows.map((row) => row.kind)).toEqual(['line', 'gap', 'gap', 'line']);
    expect(config.lastNumber).toBe(2);
  });

  it('an empty or header-only source has no line', () => {
    expect(parsePassageConfig('')).toEqual({ rows: [], lastNumber: 0 });
    expect(parsePassageConfig('start=40\n\n')).toEqual({ rows: [], lastNumber: 0 });
  });
});
