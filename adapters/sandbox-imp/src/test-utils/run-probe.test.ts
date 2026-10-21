import { expect, mock, onTestFinished, test } from 'bun:test';
import {
  buildMockGrantSpec,
  buildMockSandboxSpec,
  setupTestRecorder,
} from '@heynixie/sandbox/test-utils';
import { buildImpSandboxAdapter } from '../build-imp-sandbox-adapter';
import { runProbe } from './run-probe';
import { startFakeImp } from './start-fake-imp';

async function setupTest() {
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp();

  const adapter = buildImpSandboxAdapter({
    port: imp.port,
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: '/nonexistent.sock' }),
  });

  return { imp, adapter };
}

test('it reports the status and a zero exit for a server that answers', async () => {
  const ctx = await setupTest();

  const answerRequest = mock(() => new Response('ok', { status: 204 }));
  const server = Bun.serve({ port: 0, fetch: answerRequest });

  onTestFinished(() => server.stop(true));

  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ toolRoute: false }));
  const outcome = await runProbe(sandbox, `http://127.0.0.1:${server.port}/`, { viaBroker: false });

  expect(outcome).toBe('status=204 exit=0');
});

test('it reports status 000 and the refused-connection exit for a port with no listener', async () => {
  const ctx = await setupTest();

  const answerRequest = mock(() => new Response('ok'));
  const server = Bun.serve({ port: 0, fetch: answerRequest });
  const closedPort = server.port;

  await server.stop(true);

  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ toolRoute: false }));
  const outcome = await runProbe(sandbox, `http://127.0.0.1:${closedPort}/`, { viaBroker: false });

  expect(outcome).toBe('status=000 exit=7');
});

test('it goes through the proxy that the guest env names when it uses the broker', async () => {
  const ctx = await setupTest();

  const grant = buildMockGrantSpec();

  ctx.imp.secrets.set(grant.secret, [grant.host]);

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ grants: [grant], toolRoute: false }),
  );

  const outcome = await runProbe(sandbox, 'https://example.test/', { viaBroker: true });

  expect(outcome).toBe('status=000 exit=5');
});
