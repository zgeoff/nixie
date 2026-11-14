import { expect, test } from 'bun:test';
import { buildPromptEntryLines } from './build-prompt-entry-lines';

test('it writes a one-line value in JSON quotes', () => {
  expect(
    buildPromptEntryLines('writer', { instruction: 'prompts/writer-instruction.md' }, '  '),
  ).toStrictEqual(['  writer:', '    instruction: "prompts/writer-instruction.md"']);
});

test('it writes a value of several lines as a literal block, and leaves a blank line unindented', () => {
  expect(buildPromptEntryLines('compaction', { _template: 'alpha\n\nbeta' }, '  ')).toStrictEqual([
    '  compaction:',
    '    _template: |-',
    '      alpha',
    '',
    '      beta',
  ]);
});

test.each([
  ['a CRLF line break', 'alpha\r\nbeta', String.raw`"alpha\r\nbeta"`],
  ['a final line break', 'alpha\nbeta\n', String.raw`"alpha\nbeta\n"`],
  ['a leading space', ' alpha\nbeta', String.raw`" alpha\nbeta"`],
])('it writes a value with %s in JSON quotes', (_label, value, quoted) => {
  expect(buildPromptEntryLines('compaction', { _template: value }, '  ')).toStrictEqual([
    '  compaction:',
    `    _template: ${quoted}`,
  ]);
});
