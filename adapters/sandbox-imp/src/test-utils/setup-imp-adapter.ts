import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SandboxAdapter, ToolTarget } from '@heynixie/sandbox';
import { buildImpSandboxAdapter } from '../build-imp-sandbox-adapter';
import type { PublicEgressConfig } from '../parse-imp-config';
import { setupTestRecorder } from './setup-test-recorder';
import type { FakeImp } from './start-fake-imp';
import { startFakeImp } from './start-fake-imp';

type TestRecorder = Awaited<ReturnType<typeof setupTestRecorder>>;

interface TestAdapter extends TestRecorder {
  readonly imp: FakeImp;
  readonly dir: string;
  readonly adapter: SandboxAdapter;
  readonly buildAdapter: (publicEgress: PublicEgressConfig | null) => SandboxAdapter;
  readonly buildAdapterWithTarget: (target: ToolTarget) => SandboxAdapter;
}

const testPublicEgress: PublicEgressConfig = {
  hostAddresses: ['203.0.113.7/24'],
  egressDeny: ['198.51.100.0/24'],
};

// A recorder on a fresh log, a fake impd, a tool endpoint on a unix socket that answers with the
// path and bearer token it saw, and the imp adapter on all three.
export async function setupImpAdapter(): Promise<TestAdapter> {
  const ctx = await setupTestRecorder();
  const imp = await startFakeImp();
  const dir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-imp-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  onTestFinished(startToolEndpoint(join(dir, 'tools.sock')));

  const buildWith = (target: ToolTarget, publicEgress: PublicEgressConfig | null): SandboxAdapter =>
    buildImpSandboxAdapter({
      port: imp.port,
      recorder: ctx.recorder,
      config: { publicEgress },
      toolTarget: () => target,
      guestToolPort: imp.guestToolPort,
    });
  const buildAdapter = (publicEgress: PublicEgressConfig | null): SandboxAdapter =>
    buildWith({ path: join(dir, 'tools.sock') }, publicEgress);
  const buildAdapterWithTarget = (target: ToolTarget): SandboxAdapter =>
    buildWith(target, testPublicEgress);

  return {
    ...ctx,
    imp,
    dir,
    adapter: buildAdapter(testPublicEgress),
    buildAdapter,
    buildAdapterWithTarget,
  };
}

function startToolEndpoint(socketPath: string): () => Promise<void> {
  const tools = Bun.serve({
    unix: socketPath,
    fetch: (request) => {
      const path = new URL(request.url).pathname;

      return Response.json({ path, authorization: request.headers.get('authorization') });
    },
  });

  return () => tools.stop(true);
}
