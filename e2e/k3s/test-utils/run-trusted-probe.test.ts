import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { runTrustedProbe } from './run-trusted-probe';

function setupTest() {
  return {
    kubectl: {
      argv: [process.execPath, join(import.meta.dir, 'run-stub-kubectl.ts')],
      kubeconfig: '/tmp/kubeconfig',
      namespace: 'nixie',
    },
  };
}

test('it connects from this machine to a listener on loopback', async () => {
  const ctx = setupTest();
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });

  onTestFinished(() => {
    listener.stop(true);
  });

  const outcome = await runTrustedProbe(ctx.kubectl, {
    host: '127.0.0.1',
    port: listener.port,
    from: 'local',
  });

  expect(outcome).toBe('connected');
});

test('it reports a failure from this machine for a port with no listener', async () => {
  const ctx = setupTest();
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const port = listener.port;

  listener.stop(true);

  const outcome = await runTrustedProbe(ctx.kubectl, { host: '127.0.0.1', port, from: 'local' });

  expect(outcome).toStartWith('failed ');
});

test('it runs the probe in nixie’s container with the target in its environment', async () => {
  const ctx = setupTest();

  const outcome = await runTrustedProbe(ctx.kubectl, {
    host: '10.42.0.7',
    port: 8080,
    from: 'pod',
  });

  expect(JSON.parse(outcome)).toStrictEqual([
    '--kubeconfig',
    '/tmp/kubeconfig',
    '--namespace',
    'nixie',
    'exec',
    'nixie-0',
    '--container',
    'nixie',
    '--',
    'env',
    'PROBE_HOST=10.42.0.7',
    'PROBE_PORT=8080',
    'bun',
    '-e',
    expect.toInclude('Bun.connect'),
  ]);
});
