import { expect, test } from 'bun:test';
import { buildBalancedCondition } from '../test-utils/build-balanced-condition';
import { checkCondition } from './check-condition';

function setupTest() {
  return { check: (cel: string) => checkCondition({ cel, note: 'a note' }) };
}

test('it refuses a condition with no note with condition_note_missing', () => {
  expect(checkCondition({ cel: 'args.count == 1' })).toStrictEqual({
    ok: false,
    fault: 'condition_note_missing',
    detail: expect.any(String),
  });
});

test('it checks the note before anything else', () => {
  expect(checkCondition({ cel: '1 +' })).toMatchObject({ fault: 'condition_note_missing' });
});

test('it checks the length before the parse', () => {
  const ctx = setupTest();

  expect(ctx.check(`args.s == "${'a'.repeat(1000)}`)).toMatchObject({
    fault: 'condition_too_large',
  });
});

test('it counts the length of the raw text, so decomposed text over 1,000 units is refused', () => {
  const ctx = setupTest();

  // 500 decomposed letters are 1,000 units and 500 once normalised
  const text = 'e\u0301'.repeat(500);

  expect(ctx.check(`args.s == "${text}"`)).toMatchObject({ fault: 'condition_too_large' });
});

test('it refuses a condition that does not parse with condition_syntax', () => {
  const ctx = setupTest();

  expect(ctx.check('args.count ==')).toMatchObject({ ok: false, fault: 'condition_syntax' });
});

test('it refuses a construct outside the subset before the type check', () => {
  const ctx = setupTest();

  expect(ctx.check('args.count + "a"')).toMatchObject({
    fault: 'condition_not_allowed',
    detail: 'arithmetic',
  });
});

test('it names the refused construct', () => {
  const ctx = setupTest();

  expect(ctx.check('args.name.matches("a")')).toStrictEqual({
    ok: false,
    fault: 'condition_not_allowed',
    detail: 'matches()',
  });
});

test('it refuses an undeclared variable with condition_type', () => {
  const ctx = setupTest();

  expect(ctx.check('user.name == "a"')).toMatchObject({ fault: 'condition_type' });
});

test.each(['tool.exists(x, x == "a")', 'definition.all(x, x == "a")', 'now.exists(x, x)'])(
  'it refuses a macro over a name that is no list with condition_type: %s',
  (cel) => {
    const ctx = setupTest();

    expect(ctx.check(cel)).toMatchObject({ fault: 'condition_type' });
  },
);

test('it refuses a type error with condition_type', () => {
  const ctx = setupTest();

  expect(ctx.check('tool == 1')).toMatchObject({ fault: 'condition_type' });
});

test('it refuses a result of type dyn, which a bare argument gives', () => {
  const ctx = setupTest();

  expect(ctx.check('args.flag')).toMatchObject({ fault: 'condition_type' });
});

test('it accepts a comparison of a dyn value, whose result is bool', () => {
  const ctx = setupTest();

  expect(ctx.check('args.flag == true')).toMatchObject({ ok: true });
});

test('it refuses a result that is not bool', () => {
  const ctx = setupTest();

  expect(ctx.check('size(args.list)')).toMatchObject({ fault: 'condition_type' });
});

test('it accepts a condition of exactly 1,000 characters', () => {
  const ctx = setupTest();
  const cel = `args.s == "${'a'.repeat(988)}"`;

  expect(cel).toHaveLength(1000);
  expect(ctx.check(cel)).toMatchObject({ ok: true });
});

test('it refuses a condition of 1,001 characters with condition_too_large', () => {
  const ctx = setupTest();

  expect(ctx.check(`args.s == "${'a'.repeat(989)}"`)).toMatchObject({
    fault: 'condition_too_large',
  });
});

test('it accepts exactly 100 parsed nodes', () => {
  const ctx = setupTest();
  const terms = Array.from({ length: 50 }, () => 'true');
  const cel = `!${buildBalancedCondition(terms, '&&')}`;

  expect(ctx.check(cel)).toMatchObject({ ok: true });
});

test('it refuses 101 parsed nodes with condition_too_large', () => {
  const ctx = setupTest();
  const terms = Array.from({ length: 51 }, () => 'true');
  const cel = buildBalancedCondition(terms, '&&');

  expect(ctx.check(cel)).toMatchObject({ fault: 'condition_too_large' });
});

test('it accepts a flat chain of 13 literals, 12 levels deep', () => {
  const ctx = setupTest();

  expect(ctx.check(Array.from({ length: 13 }, () => 'true').join(' && '))).toMatchObject({
    ok: true,
  });
});

test('it refuses a flat chain of 14 literals, 13 levels deep, with condition_too_large', () => {
  const ctx = setupTest();

  expect(ctx.check(Array.from({ length: 14 }, () => 'true').join(' && '))).toMatchObject({
    fault: 'condition_too_large',
    detail: 'deeper than 12 levels',
  });
});

test('it accepts a condition 12 levels deep', () => {
  const ctx = setupTest();
  const path = Array.from({ length: 11 }, (_, index) => `.a${index}`).join('');

  expect(ctx.check(`args${path} == 1`)).toMatchObject({ ok: true });
});

test('it refuses a condition 13 levels deep with condition_too_large', () => {
  const ctx = setupTest();
  const path = Array.from({ length: 12 }, (_, index) => `.a${index}`).join('');

  expect(ctx.check(`args${path} == 1`)).toMatchObject({ fault: 'condition_too_large' });
});

test('it accepts a list literal of 50 elements', () => {
  const ctx = setupTest();

  expect(
    ctx.check(`args.count in [${Array.from({ length: 50 }, () => '1').join(', ')}]`),
  ).toMatchObject({
    ok: true,
  });
});

test('it refuses a list literal of 51 elements with condition_too_large', () => {
  const ctx = setupTest();

  expect(
    ctx.check(`args.count in [${Array.from({ length: 51 }, () => '1').join(', ')}]`),
  ).toMatchObject({
    fault: 'condition_too_large',
  });
});

test('it passes the limit on 3 arguments to a call, and refuses 4', () => {
  const ctx = setupTest();

  expect(ctx.check('args.s.startsWith("a", "b", "c")')).toMatchObject({ fault: 'condition_type' });

  expect(ctx.check('args.s.startsWith("a", "b", "c", "d")')).toMatchObject({
    fault: 'condition_too_large',
  });
});

test('it builds the view of a condition with a phrase for each part', () => {
  const ctx = setupTest();

  const checked = ctx.check(
    'now.getHours("Europe/London") < 17 && args.subject.startsWith("Term") && !has(args.cc)',
  );

  expect(checked).toStrictEqual({
    ok: true,
    view: {
      kind: 'all',
      parts: [
        {
          kind: 'compare',
          subject: { kind: 'time', part: 'hour', zone: 'Europe/London' },
          op: '<',
          value: 17,
        },
        {
          kind: 'text',
          subject: { kind: 'variable', name: 'args', path: ['subject'] },
          op: 'startsWith',
          value: 'Term',
        },
        {
          kind: 'not',
          part: {
            kind: 'present',
            subject: { kind: 'variable', name: 'args', path: ['cc'] },
          },
        },
      ],
    },
  });
});

test('it refuses two literals of different number types at the type check', () => {
  const checked = checkCondition({ cel: '1 == 1.0', note: 'a note' });

  expect(checked).toStrictEqual({
    ok: false,
    fault: 'condition_type',
    detail: expect.any(String),
  });
});

test.each<readonly [string, string]>([
  ['arithmetic', 'args.count + 1 == 6'],
  ['?:', '(args.count == 5 ? true : false)'],
  ['a map literal', '{"a": 1} == args.to'],
  ['matches', 'args.name.matches("T.*")'],
  ['matches as a function', 'matches(args.name, "T.*")'],
  ['bytes', 'b"abc" == args.count'],
  ['a bytes method', 'bytes("a") == bytes("a")'],
  ['map', 'args.list.map(x, x) == [1]'],
  ['filter', 'size(args.list.filter(x, x > 1)) == 2'],
  ['exists_one', 'args.list.exists_one(x, x == 1)'],
  ['cel.bind', 'cel.bind(v, 1, v == args.count)'],
  ['int()', 'int("1") == args.count'],
  ['timestamp()', 'timestamp("2026-01-01T00:00:00Z") == now'],
  ['duration()', 'duration("1h") == duration("1h")'],
  ['an optional type', 'optional.none().hasValue()'],
  ['null', 'args.count == null'],
  ['a uint literal', 'args.count == 5u'],
  ['a method of a built-in', 'args.name.charAt(0) == "T"'],
  ['a macro inside a macro', 'args.list.exists(x, args.list.all(y, y == x))'],
  ['a macro in the receiver of a macro', 'args.list.exists(x, x == 1).exists(y, y)'],
  ['a macro over a map', 'args.exists(key, key == "a")'],
  ['a macro over a map with all', 'args.all(key, key == "a")'],
  ['a timestamp method with no zone', 'now.getHours() == 1'],
  ['a timestamp method with an unknown zone', 'now.getHours("Nowhere/Land") == 1'],
  ['a timestamp method with a zone that is not a literal', 'now.getHours(args.name) == 1'],
])('it refuses %s with condition_not_allowed', (_label, cel) => {
  const ctx = setupTest();
  const checked = ctx.check(cel);

  expect(checked).toStrictEqual({
    ok: false,
    fault: 'condition_not_allowed',
    detail: expect.any(String),
  });
});
