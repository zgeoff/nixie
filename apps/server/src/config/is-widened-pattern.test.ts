import { expect, test } from 'bun:test';
import { isWidenedPattern } from './is-widened-pattern';

test.each([
  { released: String.raw`^deployment:[\w-]+$`, current: '^deployment:.+$' },
  { released: String.raw`^deployment:[\w-]+$`, current: '^deployment:.*$' },
  { released: String.raw`^deployment:[\w-]*$`, current: '^deployment:.*$' },
  { released: '^[a-z0-9]+$', current: '^.+$' },
  { released: String.raw`^v\.[\d]+$`, current: String.raw`^v\..+$` },
  { released: '^key:[ -~]+$', current: '^key:.+$' },
])('it accepts $released widened to $current', (row) => {
  expect(isWidenedPattern(row.released, row.current)).toBe(true);
});

test.each([
  {
    label: 'a narrowed pattern',
    released: '^deployment:.+$',
    current: String.raw`^deployment:[\w-]+$`,
  },
  {
    label: 'a different prefix',
    released: String.raw`^deployment:[\w-]+$`,
    current: '^secret:.+$',
  },
  {
    label: 'a class with a whitespace escape',
    released: String.raw`^deployment:[\w\s]+$`,
    current: '^deployment:.+$',
  },
  { label: 'a negated class', released: '^deployment:[^:]+$', current: '^deployment:.+$' },
  { label: 'a class with .', released: '^deployment:[a.]+$', current: '^deployment:.+$' },
  {
    label: 'a class with a newline escape',
    released: String.raw`^deployment:[a\n]+$`,
    current: '^deployment:.+$',
  },
  {
    label: 'a class with an escaped line separator',
    released: String.raw`^deployment:[a\u2028]+$`,
    current: '^deployment:.+$',
  },
  {
    label: 'a class with a character outside printable ASCII',
    released: `^deployment:[a${String.fromCodePoint(0xe9)}]+$`,
    current: '^deployment:.+$',
  },
  {
    label: 'a * that becomes +',
    released: String.raw`^deployment:[\w-]*$`,
    current: '^deployment:.+$',
  },
  {
    label: 'an unanchored current pattern',
    released: String.raw`^deployment:[\w-]+$`,
    current: '^deployment:.+',
  },
  { label: 'an unrelated edit', released: '^[a-z]+$', current: '^[a-z0-9]{2,}$' },
  {
    label: 'a released pattern with more after the class',
    released: String.raw`^a[\w]+b$`,
    current: '^a.+$',
  },
])('it refuses $label', (row) => {
  expect(isWidenedPattern(row.released, row.current)).toBe(false);
});
