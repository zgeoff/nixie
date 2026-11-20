import { expect, mock, onTestFinished, test } from 'bun:test';
import {
  buildMockGrantSpec,
  buildMockSandboxSpec,
  setupTestRecorder,
} from '@heynixie/sandbox/test-utils';
import { buildImpSandboxAdapter } from '../sandbox/build-imp-sandbox-adapter';
import { runProbe } from './run-probe';
import { seedSecret } from './seed-secret';
import { startFakeImp } from './start-fake-imp';
import { startSharedImpd } from './start-impd';

async function setupTest() {
  const started = await startSharedImpd();
  const recorder = await setupTestRecorder();
  const imp = await startFakeImp(started);

  const adapter = buildImpSandboxAdapter({
    port: imp.port,
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: '/nonexistent.sock' }),
  });

  return { imp, adapter, impd: started.impd };
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

  await seedSecret(ctx.impd, grant.secret, [grant.host]);

  const sandbox = await ctx.adapter.create(
    buildMockSandboxSpec({ grants: [grant], toolRoute: false }),
  );

  const outcome = await runProbe(sandbox, 'https://example.test/', { viaBroker: true });

  expect(outcome).toBe('status=000 exit=5');
});

test('it sends the key header the caller names', async () => {
  const ctx = await setupTest();

  const answerRequest = mock((request: Request) => new Response(request.headers.get('x-api-key')));
  const server = Bun.serve({ port: 0, fetch: answerRequest });

  onTestFinished(() => server.stop(true));

  const sandbox = await ctx.adapter.create(buildMockSandboxSpec({ toolRoute: false }));

  await runProbe(sandbox, `http://127.0.0.1:${server.port}/`, {
    viaBroker: false,
    apiKey: 'sk-test-own',
  });

  expect(answerRequest.mock.calls[0]?.[0].headers.get('x-api-key')).toBe('sk-test-own');
});
