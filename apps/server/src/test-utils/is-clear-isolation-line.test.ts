import { expect, test } from 'bun:test';
import { isClearIsolationLine } from './is-clear-isolation-line';

test.each([
  ['a connected listener', '10.0.0.5:8443 listener connected; sandbox failed ECONNREFUSED'],
  [
    'an unprovable IPv6 listener',
    '2001:db8::5:8443 listener unprovable from the runner, which has no routable IPv6 address; sandbox failed timeout',
  ],
  [
    'an unprovable closed port',
    '198.51.100.9:8443 listener unprovable from the runner, which finds no listener on the port; sandbox failed ECONNREFUSED',
  ],
])('it passes a failed sandbox beside %s', (_label, line) => {
  expect(isClearIsolationLine(line)).toBe(true);
});

test.each([
  ['a failed listener', '10.0.0.5:8443 listener failed ECONNREFUSED; sandbox failed ECONNREFUSED'],
  ['a connected sandbox', '10.0.0.5:8443 listener connected; sandbox connected'],
  [
    'a connected sandbox beside an unprovable listener',
    '198.51.100.9:8443 listener unprovable from the runner, which finds no listener on the port; sandbox connected',
  ],
])('it fails %s', (_label, line) => {
  expect(isClearIsolationLine(line)).toBe(false);
});
