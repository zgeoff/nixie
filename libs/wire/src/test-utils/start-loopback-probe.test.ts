import { expect, onTestFinished, test } from 'bun:test';
import { startLoopbackProbe } from './start-loopback-probe';

test('it records the URL of each request that reaches it', async () => {
  const probe = startLoopbackProbe();

  onTestFinished(() => {
    probe.stop();
  });

  await fetch(probe.url);

  expect(probe.hits).toStrictEqual([probe.url]);
});
