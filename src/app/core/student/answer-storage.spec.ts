import {
  answerStorage,
  answerStorageKey,
  clearAnswers,
  emptyAnswers,
  readAnswers,
  StoredBlockAnswers,
  writeAnswers,
} from './answer-storage';

const KEY = answerStorageKey('course-1', 'block-1');

describe('answer-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('answerStorageKey references (courseId, blockId)', () => {
    expect(KEY).toBe('oc.student.answers.course-1.block-1');
  });

  it('readAnswers returns the empty value without storage or stored entry', () => {
    expect(readAnswers(null, KEY)).toEqual(emptyAnswers());
    expect(readAnswers(localStorage, KEY)).toEqual({ version: 2, answers: {} });
  });

  it('round-trips a v2 value through write then read', () => {
    const value: StoredBlockAnswers = {
      version: 2,
      answers: {
        'q-1': { text: 'Ma réponse.', locked: true, updatedAt: '2026-08-01T10:00:00Z' },
      },
    };
    expect(writeAnswers(localStorage, KEY, value)).toBe(true);
    expect(readAnswers(localStorage, KEY)).toEqual(value);
  });

  it('migrates a stored v1 entry ({texte}) to the v2 shape ({text}) on read', () => {
    // Donnée historique v1, telle que persistée avant le renommage.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        answers: {
          'q-1': { texte: 'Réponse héritée', locked: true, updatedAt: '2026-07-01T09:00:00Z' },
          'q-2': { texte: '', locked: false, updatedAt: '' },
        },
      }),
    );

    expect(readAnswers(localStorage, KEY)).toEqual({
      version: 2,
      answers: {
        'q-1': { text: 'Réponse héritée', locked: true, updatedAt: '2026-07-01T09:00:00Z' },
        'q-2': { text: '', locked: false, updatedAt: '' },
      },
    });
  });

  it('falls back to the empty value for corrupt JSON or an unknown version', () => {
    localStorage.setItem(KEY, '{oops');
    expect(readAnswers(localStorage, KEY)).toEqual(emptyAnswers());

    localStorage.setItem(KEY, JSON.stringify({ version: 3, answers: {} }));
    expect(readAnswers(localStorage, KEY)).toEqual(emptyAnswers());
  });

  it('drops malformed entries and normalizes partial ones', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        answers: {
          'q-1': { text: 'ok' },
          'q-2': { locked: true }, // ni text ni texte → ignorée
          'q-3': 42,
        },
      }),
    );

    expect(readAnswers(localStorage, KEY)).toEqual({
      version: 2,
      answers: { 'q-1': { text: 'ok', locked: false, updatedAt: '' } },
    });
  });

  it('writeAnswers reports failure without storage', () => {
    expect(writeAnswers(null, KEY, emptyAnswers())).toBe(false);
  });

  it('clearAnswers removes the entry (no-op without storage)', () => {
    writeAnswers(localStorage, KEY, {
      version: 2,
      answers: { 'q-1': { text: 'x', locked: false, updatedAt: '' } },
    });
    clearAnswers(localStorage, KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
    clearAnswers(null, KEY); // ne jette pas
  });

  it('answerStorage returns the usable localStorage (stubbed in jsdom)', () => {
    expect(answerStorage()).toBe(localStorage);
  });
});
