import { expect, test } from 'bun:test';
import { makeOriginLog, toOrigin } from './make-origin-log';

test.each([
  { url: 'https://accounts.itch.io/login?token=abc#x', origin: 'https://accounts.itch.io' },
  { url: 'http://example.test:8080/path', origin: 'http://example.test' },
  { url: 'about:blank', origin: null },
  { url: 'data:text/html,hi', origin: null },
  { url: 'not a url', origin: null },
])('#toOrigin reads $url as $origin', (row) => {
  expect(toOrigin(row.url)).toBe(row.origin);
});

test('it lists the sites in the order shown, with the start site first and no repeat in a row', () => {
  const log = makeOriginLog();

  log.begin('https://itch.io/a');
  log.record('https://itch.io/b');
  log.record('https://accounts.itch.io/login');
  log.record('https://itch.io/');

  expect(log.end()).toStrictEqual([
    'https://itch.io',
    'https://accounts.itch.io',
    'https://itch.io',
  ]);
});

test('it records nothing before a list is begun or after it ends', () => {
  const log = makeOriginLog();

  log.record('https://before.example/');
  log.begin(null);
  log.end();
  log.record('https://after.example/');

  expect(log.end()).toStrictEqual([]);
});

test('it keeps at most 20 sites', () => {
  const log = makeOriginLog();

  log.begin(null);

  for (let index = 0; index < 30; index += 1) {
    log.record(`https://site${String(index)}.example/`);
  }

  expect(log.end()).toHaveLength(20);
});

test('it is open from the start of a list to its end', () => {
  const log = makeOriginLog();
  const before = log.isOpen();

  log.begin(null);

  const during = log.isOpen();

  log.end();

  expect([before, during, log.isOpen()]).toStrictEqual([false, true, false]);
});
