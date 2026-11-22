import { expect, test } from 'bun:test';
import { buildWorkerSocketPageURL } from './build-worker-socket-page-url';

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
