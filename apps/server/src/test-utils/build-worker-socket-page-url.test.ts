import { expect, test } from 'bun:test';
import { Script } from 'node:vm';
import { buildWorkerSocketPageURL } from './build-worker-socket-page-url';

test('it gives the Worker a script that parses as a classic script, as a Worker of a data URL runs', () => {
  const url = buildWorkerSocketPageURL(['ws://127.0.0.1:5900/']);
  const html = decodeURIComponent(url.slice('data:text/html,'.length));
  const quoted = /encodeURIComponent\((?<source>".*")\)\);/u.exec(html)?.groups?.['source'] ?? '';
  const source = String(JSON.parse(quoted));

  expect(() => new Script(source)).not.toThrow();
});

test('it builds a data URL of a page that starts a Worker with every socket URL', () => {
  const url = buildWorkerSocketPageURL(['ws://127.0.0.1:5900/', 'ws://[::1]:5900/']);
  const html = decodeURIComponent(url.slice('data:text/html,'.length));

  expect([url.startsWith('data:text/html,'), html]).toStrictEqual([
    true,
    expect.stringMatching(
      /^<title>waiting<\/title><script>.*new Worker\(.*ws:\/\/127\.0\.0\.1:5900/u,
    ),
  ]);
});
