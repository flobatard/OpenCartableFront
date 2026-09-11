import { describe, expect, it } from 'vitest';
import { appendCapped, cleanTraceback } from './python-output';

describe('cleanTraceback', () => {
  it('drops the Pyodide frames before the student code', () => {
    const message = [
      'Traceback (most recent call last):',
      '  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code_async',
      '    await CodeRunner(',
      '  File "/lib/python314.zip/_pyodide/_base.py", line 411, in run_async',
      '    coroutine = eval(self.code, globals, locals)',
      '  File "main.py", line 2, in <module>',
      '    print(1 / 0)',
      '          ~~^~~',
      'ZeroDivisionError: division by zero',
      '',
    ].join('\n');
    expect(cleanTraceback(message)).toBe(
      [
        'Traceback (most recent call last):',
        '  File "main.py", line 2, in <module>',
        '    print(1 / 0)',
        '          ~~^~~',
        'ZeroDivisionError: division by zero',
      ].join('\n'),
    );
  });

  it('keeps a message without student frame as is (syntax error)', () => {
    const message = '  File "main.py", line 1\n    print(\n         ^\nSyntaxError: \'(\' was never closed';
    expect(cleanTraceback(message)).toBe(message);
  });
});

describe('appendCapped', () => {
  it('appends while under the cap', () => {
    expect(appendCapped('ab', 'cd', 10)).toEqual({ text: 'abcd', truncated: false });
  });

  it('cuts at the cap and says so', () => {
    expect(appendCapped('abcd', 'efgh', 6)).toEqual({ text: 'abcdef', truncated: true });
  });
});
