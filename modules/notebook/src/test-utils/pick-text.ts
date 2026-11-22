import invariant from 'tiny-invariant';

// A string a test reads out of a JSON result or record payload, which fails the test when the value
// is anything else.
export function pickText(value: unknown): string {
  invariant(typeof value === 'string');

  return value;
}
