import { expect, test } from 'bun:test';
import { useChatChannels } from '../test-utils/use-chat-channels';
import { parsePlace } from './parse-place';
import type { Destination } from './types';

test.each<[string, string, Destination | null]>([
  [
    'a URL with a port and a query',
    'https://Docs.Example.org:8443/a?b=1',
    { kind: 'site', domain: 'docs.example.org' },
  ],
  ['a leading www', 'https://www.example.org/', { kind: 'site', domain: 'example.org' }],
  ['a bare host with a port', 'example.org:8443', { kind: 'site', domain: 'example.org' }],
  ['a trailing dot', 'https://example.org./x', { kind: 'site', domain: 'example.org' }],
  ['a one-label host', 'localhost', { kind: 'site', domain: 'localhost' }],
  ['www over a one-label host', 'www.localhost', { kind: 'site', domain: 'localhost' }],
  [
    'a custom scheme in mixed case',
    'custom://MiXeD.Example/x',
    { kind: 'site', domain: 'mixed.example' },
  ],
  ['a backslash in a host', String.raw`foo\bar`, null],
  ['a query on a mail address domain', 'sam@example.org?query', null],
  ['an IP address', 'http://10.0.0.1:80/x', { kind: 'site', domain: '10.0.0.1' }],
  [
    'an internationalised host',
    'https://bücher.example/',
    { kind: 'site', domain: 'xn--bcher-kva.example' },
  ],
  ['www over a public suffix', 'www.org', { kind: 'site', domain: 'www.org' }],
  ['www twice drops one label', 'www.www.example.org', { kind: 'site', domain: 'www.example.org' }],
  ['an address in any case', 'Sam@Example.org', { kind: 'address', address: 'sam@example.org' }],
  ['a phone number with spaces', '+61 420 000 000', { kind: 'phone', e164: '+61420000000' }],
  ['a phone number with dashes', '+61-420-000-000', { kind: 'phone', e164: '+61420000000' }],
  ['a phone number with no country code', '0420 000 000', null],
  ['text with spaces', 'not a place', null],
  ['an empty string', '', null],
])('#parsePlace reads %s', (_name, text, expected) => {
  expect(parsePlace(text)).toStrictEqual(expected);
});

test('#parsePlace reads an unknown channel as a host and a port', () => {
  expect(parsePlace('chatty:51234')).toStrictEqual({ kind: 'site', domain: 'chatty' });
});

test('#parsePlace reads a handle of a channel that a feature named', () => {
  useChatChannels(['telegram']);

  expect(parsePlace('telegram:51234')).toStrictEqual({
    kind: 'handle',
    channel: 'telegram',
    id: '51234',
  });
});

test('#parsePlace reads a channel name as a host while no feature names a channel', () => {
  expect(parsePlace('telegram:51234')).toStrictEqual({ kind: 'site', domain: 'telegram' });
});
