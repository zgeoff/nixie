import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { checkCondition } from './check-condition';
import { renderConditionWords } from './render-condition-words';

function setupTest() {
  return {
    words: (cel: string) => {
      const checked = checkCondition({ cel, note: 'a note' });

      invariant(checked.ok, 'the condition passes the check');

      return renderConditionWords(checked.view);
    },
  };
}

test.each([
  [
    'compare of the hour',
    'now.getHours("Europe/London") < 17',
    'the hour in Europe/London is before 17',
  ],
  ['compare of the minute', 'now.getMinutes("UTC") >= 30', 'the minute in UTC is at or after 30'],
  [
    'compare of the weekday names the day',
    'now.getDayOfWeek("UTC") == 1',
    'the day of the week in UTC is Monday',
  ],
  [
    'compare of the month names the month',
    'now.getMonth("UTC") != 0',
    'the month in UTC is not January',
  ],
  [
    'compare of the day of the month',
    'now.getDate("UTC") == 1',
    'the day of the month in UTC is 1',
  ],
  ['compare of the year', 'now.getFullYear("UTC") > 2025', 'the year in UTC is after 2025'],
  ['compare of a variable', 'args.amount < 100', '`args.amount` is less than 100'],
  ['compare with the literal first', '100 > args.amount', '`args.amount` is less than 100'],
  ['compare of text', 'tool == "mail.send"', '`tool` is "mail.send"'],
  ['in on a list', 'args.n in [1, 2]', '`args.n` is one of 1, 2'],
  ['text', 'args.subject.startsWith("Term")', '`args.subject` starts with "Term"'],
  ['text ends with', 'args.file.endsWith(".pdf")', '`args.file` ends with ".pdf"'],
  ['text contains', 'args.file.contains("x")', '`args.file` contains "x"'],
  ['size', 'size(args.to) <= 3', 'the size of `args.to` is at most 3'],
  ['present', 'has(args.to.address)', '`args.to.address` is present'],
  ['not', '!has(args.cc)', 'it is not so that `args.cc` is present'],
  [
    'each',
    'args.files.all(file, file.endsWith(".pdf"))',
    'every item of `args.files`: the item ends with ".pdf"',
  ],
  ['some', 'args.files.exists(file, file == "a")', 'some item of `args.files`: the item is "a"'],
])('it renders a %s', (_label, cel, expected) => {
  const ctx = setupTest();

  expect(ctx.words(cel)).toBe(expected);
});

test('it joins the parts of an all with and', () => {
  const ctx = setupTest();

  expect(ctx.words('now.getHours("UTC") < 17 && args.n == 1')).toBe(
    'the hour in UTC is before 17, and `args.n` is 1',
  );
});

test('it joins the parts of an any with or, and brackets a group inside another', () => {
  const ctx = setupTest();

  expect(ctx.words('args.n == 1 || (args.m == 2 && args.k == 3)')).toBe(
    '`args.n` is 1, or (`args.m` is 2, and `args.k` is 3)',
  );
});

test('it shows a part with no phrase as code', () => {
  const ctx = setupTest();

  expect(ctx.words('args.a == args.b')).toBe('`args.a == args.b`');
});

test('it shows a subject with no phrase as code inside a comparison', () => {
  const ctx = setupTest();

  expect(ctx.words('args.name.lowerAscii() == "a"')).toBe('`args.name.lowerAscii()` is "a"');
});
