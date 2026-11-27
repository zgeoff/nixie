import { expect, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing';
import { buildBalancedCondition } from '../test-utils/build-balanced-condition';
import { buildRuleCall } from '../test-utils/build-rule-call';
import { evaluateCondition } from './evaluate-condition';

// Most cases below are the conformance suite: each is an expression, a call and the result that
// the CEL language definition gives. A case that departs from the definition pins the library's
// result, with a comment that names the departure, so a version bump that changes it fails here.

function setupTest() {
  return {
    evaluate: (cel: string, overrides: Parameters<typeof buildRuleCall>[0] = {}) =>
      evaluateCondition({ cel, note: 'a note' }, buildRuleCall(overrides)),
  };
}

test.each([
  // literals
  ['bool literal, true', 'args.flag == true', { kind: 'true' }],
  ['bool literal, false', 'args.flag == false', { kind: 'false' }],
  [
    'bool literal, error on a missing key',
    'args.missing == true',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['int literal, true', 'args.count == 5', { kind: 'true' }],
  ['int literal, false', 'args.count == 6', { kind: 'false' }],
  [
    'int literal, error on a missing key',
    'args.missing == 5',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['double literal, true', 'args.half == 1.5', { kind: 'true' }],
  ['double literal, false', 'args.half == 2.5', { kind: 'false' }],
  [
    'double literal, error on a missing key',
    'args.missing == 1.5',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['string literal, true', 'args.name == "Term dates"', { kind: 'true' }],
  ['string literal, false', 'args.name == "Other"', { kind: 'false' }],
  [
    'string literal, error on a missing key',
    'args.missing == "x"',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['list literal, true', 'args.count in [1, 5, 9]', { kind: 'true' }],
  ['list literal, false', 'args.count in [1, 9]', { kind: 'false' }],
  [
    'list literal, error on a missing key',
    'args.missing in [1, 9]',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['negative number, true', 'args.count > -3', { kind: 'true' }],
  ['negative number, false', 'args.count < -3', { kind: 'false' }],
  [
    'negative number, error on a missing key',
    'args.missing < -3',
    { kind: 'error', code: 'no_such_key' },
  ],

  // access
  ['field, true', 'args.to.address == "sam@school.example"', { kind: 'true' }],
  ['field, false', 'args.to.address == "x@school.example"', { kind: 'false' }],
  ['field, error on a missing key', 'args.to.phone == "1"', { kind: 'error', code: 'no_such_key' }],
  ['index of a map, true', 'args["name"] == "Term dates"', { kind: 'true' }],
  ['index of a map, false', 'args["name"] == "x"', { kind: 'false' }],
  [
    'index of a map, error on a missing key',
    'args["missing"] == "x"',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['index of a list, true', 'args.list[0] == 1', { kind: 'true' }],
  ['index of a list, false', 'args.list[1] == 1', { kind: 'false' }],
  [
    'index of a list, error out of range',
    'args.list[5] == 1',
    { kind: 'error', code: 'index_out_of_bounds' },
  ],

  // operators
  ['==, true', 'args.count == 5', { kind: 'true' }],
  ['==, false', 'args.count == 4', { kind: 'false' }],
  ['!=, true', 'args.count != 4', { kind: 'true' }],
  ['!=, false', 'args.count != 5', { kind: 'false' }],
  ['<, true', 'args.count < 6', { kind: 'true' }],
  ['<, false', 'args.count < 5', { kind: 'false' }],
  [
    '<, error on a type mismatch of a dyn value',
    'args.name < 5',
    { kind: 'error', code: 'no_such_overload' },
  ],
  ['<=, true', 'args.count <= 5', { kind: 'true' }],
  ['<=, false', 'args.count <= 4', { kind: 'false' }],
  ['>, true', 'args.count > 4', { kind: 'true' }],
  ['>, false', 'args.count > 5', { kind: 'false' }],
  ['>=, true', 'args.count >= 5', { kind: 'true' }],
  ['>=, false', 'args.count >= 6', { kind: 'false' }],
  ['&&, true', 'args.count == 5 && args.flag == true', { kind: 'true' }],
  ['&&, false', 'args.count == 5 && args.flag == false', { kind: 'false' }],
  ['&&, error', 'args.count == 5 && args.missing == 1', { kind: 'error', code: 'no_such_key' }],
  ['||, true', 'args.count == 4 || args.flag == true', { kind: 'true' }],
  ['||, false', 'args.count == 4 || args.flag == false', { kind: 'false' }],
  ['||, error', 'args.count == 4 || args.missing == 1', { kind: 'error', code: 'no_such_key' }],
  ['!, true', '!(args.count == 4)', { kind: 'true' }],
  ['!, false', '!(args.count == 5)', { kind: 'false' }],
  ['!, error', '!(args.missing == 1)', { kind: 'error', code: 'no_such_key' }],
  ['in on a list, true', '"owner" in sources', { kind: 'true' }],
  ['in on a list, false', '"outside" in sources', { kind: 'false' }],
  [
    'in on a list, error on a missing key',
    'args.missing in sources',
    { kind: 'error', code: 'no_such_key' },
  ],

  // functions
  ['size, true', 'size(args.list) == 3', { kind: 'true' }],
  ['size, false', 'size(args.list) == 2', { kind: 'false' }],
  [
    'size, error on a missing key',
    'size(args.missing) == 2',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['has, true', 'has(args.to.address)', { kind: 'true' }],
  ['has, false', 'has(args.to.phone)', { kind: 'false' }],
  [
    'has, error when the parent is missing',
    'has(args.nobody.address)',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['startsWith, true', 'args.name.startsWith("Term")', { kind: 'true' }],
  ['startsWith, false', 'args.name.startsWith("Dates")', { kind: 'false' }],
  [
    'startsWith, error on a type mismatch of a dyn value',
    'args.count.startsWith("T")',
    { kind: 'error', code: 'no_matching_overload' },
  ],
  ['endsWith, true', 'args.name.endsWith("dates")', { kind: 'true' }],
  ['endsWith, false', 'args.name.endsWith("Term")', { kind: 'false' }],
  [
    'endsWith, error on a missing key',
    'args.missing.endsWith("a")',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['contains, true', 'args.name.contains("m d")', { kind: 'true' }],
  ['contains, false', 'args.name.contains("zz")', { kind: 'false' }],
  [
    'contains, error on a missing key',
    'args.missing.contains("a")',
    { kind: 'error', code: 'no_such_key' },
  ],
  ['lowerAscii, true', 'args.name.lowerAscii() == "term dates"', { kind: 'true' }],
  ['lowerAscii, false', 'args.name.lowerAscii() == "Term dates"', { kind: 'false' }],
  [
    'lowerAscii, error on a missing key',
    'args.missing.lowerAscii() == "a"',
    { kind: 'error', code: 'no_such_key' },
  ],

  // macros
  ['exists, true', 'args.words.exists(word, word == "Report")', { kind: 'true' }],
  ['exists, false', 'args.words.exists(word, word == "Nope")', { kind: 'false' }],
  [
    'exists, error on a type mismatch',
    'args.name.exists(word, word == "a")',
    { kind: 'error', code: 'invalid_comprehension_range' },
  ],
  [
    'exists, error on a nested map',
    'args.to.exists(key, key == "address")',
    { kind: 'error', code: 'invalid_comprehension_range' },
  ],
  [
    'all, error on an indexed nested map',
    'args["to"].all(key, key == "address")',
    { kind: 'error', code: 'invalid_comprehension_range' },
  ],
  ['all, true', 'args.words.all(word, word.size() > 3)', { kind: 'true' }],
  ['all, false', 'args.words.all(word, word == "Annual")', { kind: 'false' }],
  [
    'all, error on a missing key',
    'args.missing.all(word, word == "a")',
    { kind: 'error', code: 'no_such_key' },
  ],
])('it gives the defined result for %s: %s', (_label, cel, expected) => {
  const ctx = setupTest();

  const args = {
    flag: true,
    count: 5,
    half: 1.5,
    big: 100,
    amount: 99.5,
    name: 'Term dates',
    list: [1, 2, 3],
    words: ['Annual', 'Report'],
    to: { address: 'sam@school.example' },
  };

  expect(ctx.evaluate(cel, { args, sources: ['owner', 'task'] })).toMatchObject(expected);
});

test.each([
  [
    '&& with the error on the left, settled by false on the right',
    'args.missing == 1 && false',
    { kind: 'false' },
  ],
  [
    '&& with the error on the right, settled by false on the left',
    'false && args.missing == 1',
    { kind: 'false' },
  ],
  [
    '&& with the error on the left, unsettled',
    'args.missing == 1 && true',
    { kind: 'error', code: 'no_such_key' },
  ],
  [
    '&& with the error on the right, unsettled',
    'true && args.missing == 1',
    { kind: 'error', code: 'no_such_key' },
  ],
  [
    '|| with the error on the left, settled by true on the right',
    'args.missing == 1 || true',
    { kind: 'true' },
  ],
  [
    '|| with the error on the right, settled by true on the left',
    'true || args.missing == 1',
    { kind: 'true' },
  ],
  [
    '|| with the error on the left, unsettled',
    'args.missing == 1 || false',
    { kind: 'error', code: 'no_such_key' },
  ],
  [
    '|| with the error on the right, unsettled',
    'false || args.missing == 1',
    { kind: 'error', code: 'no_such_key' },
  ],
])('it absorbs an error as CEL defines: %s', (_label, cel, expected) => {
  const ctx = setupTest();

  expect(ctx.evaluate(cel, { args: { name: 'Term' } })).toMatchObject(expected);
});

test.each([
  ['a key of args, present', '"name" in args', { kind: 'true' }],
  ['a key of args, missing', '"missing" in args', { kind: 'false' }],
  ['a member of a list in args', '"Report" in args.words', { kind: 'true' }],
  ['has on a present key', 'has(args.name)', { kind: 'true' }],
  ['has on a missing key', 'has(args.missing)', { kind: 'false' }],
])('it reads membership and presence: %s', (_label, cel, expected) => {
  const ctx = setupTest();

  expect(ctx.evaluate(cel, { args: { name: 'Term', words: ['Annual', 'Report'] } })).toMatchObject(
    expected,
  );
});

test('it compares strings by UTF-16 unit, which departs from the definition', () => {
  const ctx = setupTest();

  // The definition orders strings by code point, so U+FFFF sorts before U+1F600. The library
  // compares UTF-16 units, where the surrogate pair of U+1F600 sorts first, and gives false.
  const call = { args: { low: '\u{FFFF}', high: '\u{1F600}' } };

  expect(ctx.evaluate('args.low < args.high', call)).toStrictEqual({ kind: 'false' });
});

test('it compares strings by code point for text below the surrogate range', () => {
  const ctx = setupTest();
  const call = { args: { low: 'apple', high: 'banana' } };

  expect(ctx.evaluate('args.low < args.high', call)).toStrictEqual({ kind: 'true' });
});

test('it compares an NFC and an NFD form of the same text as equal after normalising', () => {
  const ctx = setupTest();
  const call = { args: { name: 'Café' } };

  expect(ctx.evaluate('args.name == "Café"', call)).toStrictEqual({ kind: 'true' });
});

test('it normalises a string literal of the condition to NFC in the rule', () => {
  const ctx = setupTest();
  const nfd = 'args.name == "Café"';
  const call = { args: { name: 'Café' } };

  expect(ctx.evaluate(nfd, call)).toStrictEqual({ kind: 'true' });
});

test('it normalises an escaped decomposed literal to match the NFC text of the call', () => {
  const ctx = setupTest();
  const call = { args: { name: '\u00E9' } };

  expect(ctx.evaluate(String.raw`args.name == "e\u0301"`, call)).toStrictEqual({ kind: 'true' });
});

test('it matches a decomposed argument to an escaped composed literal', () => {
  const ctx = setupTest();
  const call = { args: { name: 'e\u0301' } };

  expect(ctx.evaluate(String.raw`args.name == "\u00e9"`, call)).toStrictEqual({ kind: 'true' });
});

test.each([
  ['an integral number against an int literal', 5, 'args.num == 5', { kind: 'true' }],
  ['an integral number against a double literal', 5, 'args.num == 5.0', { kind: 'true' }],
  ['a fraction against an int literal', 99.5, 'args.num < 100', { kind: 'true' }],
  ['a fraction against a double literal', 99.5, 'args.num == 99.5', { kind: 'true' }],
  ['a fraction equal to an int literal', 5.5, 'args.num == 5', { kind: 'false' }],

  // the definition reads 2^53 + 1 as the double 2^53 once JSON has parsed it, which is integral
  ['a number past 2^53 as an int', 2 ** 53 + 1, 'args.num == 9007199254740992', { kind: 'true' }],

  // a number past 2^63 stays a double, because an int cannot hold it
  ['a number past 2^63 as a double', 1e21, 'args.num > 9000000000000000000', { kind: 'true' }],
])('it reads JSON numbers: %s', (_label, value, cel, expected) => {
  const ctx = setupTest();

  expect(ctx.evaluate(cel, { args: { num: value } })).toMatchObject(expected);
});

// 2026-03-29 is the day the UK moves to summer time at 01:00 UTC
test.each([
  ['getHours in UTC', '2026-03-29T00:30:00Z', 'now.getHours("UTC") == 0', { kind: 'true' }],
  [
    'getHours in London before the change',
    '2026-03-29T00:30:00Z',
    'now.getHours("Europe/London") == 0',
    { kind: 'true' },
  ],
  [
    'getHours in London after the change',
    '2026-03-29T01:30:00Z',
    'now.getHours("Europe/London") == 2',
    { kind: 'true' },
  ],
  ['getMinutes in UTC', '2026-03-29T00:30:00Z', 'now.getMinutes("UTC") == 30', { kind: 'true' }],
  [
    'getMinutes in Kolkata',
    '2026-03-29T00:30:00Z',
    'now.getMinutes("Asia/Kolkata") == 0',
    { kind: 'true' },
  ],

  // getDayOfWeek counts from 0 for Sunday: 2026-03-29 is a Sunday
  [
    'getDayOfWeek in UTC counts Sunday as 0',
    '2026-03-29T00:30:00Z',
    'now.getDayOfWeek("UTC") == 0',
    { kind: 'true' },
  ],
  [
    'getDayOfWeek in New York, the evening before',
    '2026-03-29T00:30:00Z',
    'now.getDayOfWeek("America/New_York") == 6',
    { kind: 'true' },
  ],
  [
    'getDate in UTC counts from 1',
    '2026-03-29T00:30:00Z',
    'now.getDate("UTC") == 29',
    { kind: 'true' },
  ],
  [
    'getDate in Auckland, a day on',
    '2026-03-29T00:30:00Z',
    'now.getDate("Pacific/Auckland") == 29',
    { kind: 'true' },
  ],

  // getMonth counts from 0 for January: March is 2
  [
    'getMonth in UTC counts January as 0',
    '2026-03-29T00:30:00Z',
    'now.getMonth("UTC") == 2',
    { kind: 'true' },
  ],
  [
    'getFullYear in UTC',
    '2026-03-29T00:30:00Z',
    'now.getFullYear("UTC") == 2026',
    { kind: 'true' },
  ],
  ['getHours false', '2026-03-29T00:30:00Z', 'now.getHours("UTC") == 5', { kind: 'false' }],
])('it reads time: %s', (_label, at, cel, expected) => {
  const ctx = setupTest();

  expect(ctx.evaluate(cel, { at: Date.parse(at) })).toMatchObject(expected);
});

// 2026-03-08T02:30:00Z is 02:30 in UTC, a time that does not exist in New York on that day, when the
// clocks go from 02:00 to 03:00. 2026-11-01T05:30:00Z is 01:30 in New York, which occurs twice
// that day, and 05:30 in UTC.
test.each(
  ['UTC', 'America/New_York', 'Pacific/Auckland'].flatMap((hostZone) =>
    (
      [
        ['hour in the gap of New York', '2026-03-08T02:30:00Z', 'now.getHours("UTC") == 2'],
        ['minute in the gap of New York', '2026-03-08T02:30:00Z', 'now.getMinutes("UTC") == 30'],
        ['weekday in the gap of New York', '2026-03-08T02:30:00Z', 'now.getDayOfWeek("UTC") == 0'],
        ['date in the gap of New York', '2026-03-08T02:30:00Z', 'now.getDate("UTC") == 8'],
        ['month in the gap of New York', '2026-03-08T02:30:00Z', 'now.getMonth("UTC") == 2'],
        ['year in the gap of New York', '2026-03-08T02:30:00Z', 'now.getFullYear("UTC") == 2026'],
        [
          'hour of New York after the gap',
          '2026-03-08T07:30:00Z',
          'now.getHours("America/New_York") == 3',
        ],
        [
          'hour of New York before the gap',
          '2026-03-08T06:30:00Z',
          'now.getHours("America/New_York") == 1',
        ],
        [
          'hour of London in the fall-back hour of New York',
          '2026-11-01T05:30:00Z',
          'now.getHours("Europe/London") == 5',
        ],
        [
          'hour of New York at the first 01:30',
          '2026-11-01T05:30:00Z',
          'now.getHours("America/New_York") == 1',
        ],
        [
          'hour of New York at the second 01:30',
          '2026-11-01T06:30:00Z',
          'now.getHours("America/New_York") == 1',
        ],
        ['hour in the gap of Auckland', '2026-09-27T02:30:00Z', 'now.getHours("UTC") == 2'],
        ['minute in the gap of Auckland', '2026-09-27T02:30:00Z', 'now.getMinutes("UTC") == 30'],
        ['date in the gap of Auckland', '2026-09-27T02:30:00Z', 'now.getDate("UTC") == 27'],
        [
          'minute of New York before the gap',
          '2026-03-08T06:30:00Z',
          'now.getMinutes("America/New_York") == 30',
        ],
        [
          'weekday of New York before the gap',
          '2026-03-08T06:30:00Z',
          'now.getDayOfWeek("America/New_York") == 0',
        ],
        [
          'date of New York before the gap',
          '2026-03-08T06:30:00Z',
          'now.getDate("America/New_York") == 8',
        ],
        [
          'month of New York before the gap',
          '2026-03-08T06:30:00Z',
          'now.getMonth("America/New_York") == 2',
        ],
        [
          'year of New York before the gap',
          '2026-03-08T06:30:00Z',
          'now.getFullYear("America/New_York") == 2026',
        ],
        [
          'minute of New York after the gap',
          '2026-03-08T07:30:00Z',
          'now.getMinutes("America/New_York") == 30',
        ],
        [
          'minute of New York at the second 01:30',
          '2026-11-01T06:30:00Z',
          'now.getMinutes("America/New_York") == 30',
        ],
        [
          'date of New York at the first 01:30',
          '2026-11-01T05:30:00Z',
          'now.getDate("America/New_York") == 1',
        ],
        [
          'weekday of New York at the second 01:30',
          '2026-11-01T06:30:00Z',
          'now.getDayOfWeek("America/New_York") == 0',
        ],
        [
          'month of New York at the second 01:30',
          '2026-11-01T06:30:00Z',
          'now.getMonth("America/New_York") == 10',
        ],
        [
          'year, month, date and weekday of New York just before the new year',
          '2027-01-01T04:59:00Z',
          'now.getFullYear("America/New_York") == 2026 && now.getMonth("America/New_York") == 11 && now.getDate("America/New_York") == 31 && now.getDayOfWeek("America/New_York") == 4',
        ],
        [
          'year, month, date and weekday of New York at the new year',
          '2027-01-01T05:00:00Z',
          'now.getFullYear("America/New_York") == 2027 && now.getMonth("America/New_York") == 0 && now.getDate("America/New_York") == 1 && now.getDayOfWeek("America/New_York") == 5',
        ],
        [
          'day in a zone that is a day ahead',
          '2026-03-08T23:30:00Z',
          'now.getDate("Pacific/Auckland") == 9',
        ],
        [
          'year at the end of a year in a zone ahead',
          '2026-12-31T23:30:00Z',
          'now.getFullYear("Asia/Tokyo") == 2027',
        ],
      ] as const
    ).map(([label, at, cel]) => [hostZone, label, at, cel] as const),
  ),
)('it gives the same time under the host zone %s: %s', (hostZone, _label, at, cel) => {
  const ctx = setupTest();

  updateEnv('TZ', hostZone);

  expect(ctx.evaluate(cel, { at: Date.parse(at) })).toStrictEqual({ kind: 'true' });
});

test('it errors a time condition that also reads a missing key', () => {
  const ctx = setupTest();

  expect(ctx.evaluate('now.getHours("UTC") < 17 && args.missing == 1')).toMatchObject({
    kind: 'error',
    code: 'no_such_key',
  });
});

test('it reads each name of the condition input from the call', () => {
  const ctx = setupTest();

  const call = {
    tool: 'task.start/sandbox',
    effects: ['send' as const, 'read' as const],
    context: 'task' as const,
    task: 'weekly-digest',
    destinations: ['sam@school.example'],
    sources: ['owner' as const],
  };

  const cel =
    'tool == "task.start/sandbox" && "read" in effects && context == "task" && ' +
    'definition == "weekly-digest" && destinations[0] == "sam@school.example" && ' +
    '"owner" in sources && now.getFullYear("UTC") == 2026';

  expect(ctx.evaluate(cel, call)).toStrictEqual({ kind: 'true' });
});

test('it gives an empty definition outside a task run', () => {
  const ctx = setupTest();

  expect(ctx.evaluate('definition == ""')).toStrictEqual({ kind: 'true' });
});

test('it leaves a content argument out of args, so a condition that reads one errors', () => {
  const ctx = setupTest();

  const result = ctx.evaluate('args.body.contains("secret")', {
    args: { body: 'a secret', subject: 'Hi' },
    contentArgs: ['body'],
  });

  expect(result).toStrictEqual({ kind: 'error', code: 'no_such_key', missing: 'body' });
});

test('it leaves a content argument out for has, which reads it as missing', () => {
  const ctx = setupTest();

  expect(
    ctx.evaluate('has(args.body)', { args: { body: 'a' }, contentArgs: ['body'] }),
  ).toStrictEqual({
    kind: 'false',
  });
});

test('it reads an argument that is not content', () => {
  const ctx = setupTest();

  expect(
    ctx.evaluate('args.subject == "Hi"', {
      args: { body: 'a', subject: 'Hi' },
      contentArgs: ['body'],
    }),
  ).toStrictEqual({ kind: 'true' });
});

test('it reads the time of the call, so a replay agrees', () => {
  const ctx = setupTest();
  const at = Date.parse('2026-07-01T16:59:00Z');

  expect(ctx.evaluate('now.getHours("Europe/London") < 18', { at })).toStrictEqual({
    kind: 'true',
  });

  expect(ctx.evaluate('now.getHours("Europe/London") < 17', { at })).toStrictEqual({
    kind: 'false',
  });
});

test('it errors with condition_invalid for a stored condition that fails the check', () => {
  const result = evaluateCondition({ cel: 'args.count == 1', note: undefined }, buildRuleCall());

  expect(result).toStrictEqual({ kind: 'error', code: 'condition_invalid' });
});

test('it errors with condition_invalid for a stored condition outside the subset', () => {
  const ctx = setupTest();

  expect(ctx.evaluate('args.name.matches("a")')).toStrictEqual({
    kind: 'error',
    code: 'condition_invalid',
  });
});

test('it reports the argument that a call left out', () => {
  const ctx = setupTest();

  expect(ctx.evaluate('args.to == "a"')).toStrictEqual({
    kind: 'error',
    code: 'no_such_key',
    missing: 'to',
  });
});

test('it names a missing key that holds a backtick', () => {
  const ctx = setupTest();

  expect(ctx.evaluate('args["cc`address"] == 1')).toStrictEqual({
    kind: 'error',
    code: 'no_such_key',
    missing: 'cc`address',
  });
});

test('it never puts the library message in the result', () => {
  const ctx = setupTest();
  const result = ctx.evaluate('args.list[9] == 1', { args: { list: [1] } });

  expect(result).toStrictEqual({ kind: 'error', code: 'index_out_of_bounds' });
});

test('it evaluates a list of exactly 1,000 elements', () => {
  const ctx = setupTest();
  const list = Array.from({ length: 1000 }, () => 1);

  expect(ctx.evaluate('size(args.list) == 1000', { args: { list } })).toStrictEqual({
    kind: 'true',
  });
});

test('it errors every condition with input_too_large on a list of 1,001 elements', () => {
  const ctx = setupTest();
  const list = Array.from({ length: 1001 }, () => 1);

  expect(ctx.evaluate('true == true', { args: { list } })).toStrictEqual({
    kind: 'error',
    code: 'input_too_large',
  });
});

test('it evaluates strings of 262,144 UTF-16 units in total', () => {
  const ctx = setupTest();

  // the tool, an effect, a source and the key of the argument take 22 of them
  const text = 'a'.repeat(262_144 - 22);

  expect(ctx.evaluate('size(args.text) > 0', { args: { text } })).toStrictEqual({ kind: 'true' });
});

test('it errors every condition with input_too_large on strings past 262,144 units', () => {
  const ctx = setupTest();
  const text = 'a'.repeat(262_145);

  expect(ctx.evaluate('true == true', { args: { text } })).toStrictEqual({
    kind: 'error',
    code: 'input_too_large',
  });
});

test('it evaluates the costliest condition the limits allow over the largest input in 50 ms', () => {
  const words = Array.from({ length: 1000 }, (_, index) => 'w'.repeat(250) + String(index));

  // a balanced tree stays within the depth limit where a flat chain of 12 terms would not
  const predicate = buildBalancedCondition(
    Array.from({ length: 12 }, (_, index) => `word.contains("${'x'.repeat(8)}${index}")`),
    '||',
  );

  const cel = `args.words.exists(word, ${predicate})`;
  const call = buildRuleCall({ args: { words } });

  evaluateCondition({ cel, note: 'a note' }, buildRuleCall({ args: { words: ['warm'] } }));

  const startedAt = performance.now();
  const result = evaluateCondition({ cel, note: 'a note' }, call);
  const elapsedMs = performance.now() - startedAt;

  expect(result).toStrictEqual({ kind: 'false' });
  expect(elapsedMs).toBeLessThan(50);
});

test('it reads each condition text of a call once', () => {
  const call = buildRuleCall({ args: { count: 1 } });
  const first = evaluateCondition({ cel: 'args.count == 1', note: 'a note' }, call);
  const second = evaluateCondition({ cel: 'args.count == 1', note: 'a note' }, call);

  expect(second).toBe(first);
});
