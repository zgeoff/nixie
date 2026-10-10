import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { buildProcessSandboxAdapter } from '../build-process-sandbox-adapter';
import { setupTestRecorder } from './setup-test-recorder';

type TestRecorder = Awaited<ReturnType<typeof setupTestRecorder>>;

interface TestAdapter extends TestRecorder {
  readonly adapter: SandboxAdapter;
  readonly rootDir: string;
  readonly createSandbox: (spec: SandboxSpec) => Promise<Sandbox>;
  readonly buildAdapter: () => SandboxAdapter;
}

// A recorder on a fresh log, a root directory, a tool endpoint on a unix socket, and the process
// adapter on all three. createSandbox destroys each sandbox it made when the test finishes.
export async function setupProcessAdapter(): Promise<TestAdapter> {
  const ctx = await setupTestRecorder();
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const rootDir = await mkdtemp(join(tmpdir(), 'nixie-sandbox-process-'));

  stack.defer(() => rm(rootDir, { recursive: true, force: true }));
  stack.defer(startToolEndpoint(join(rootDir, 'tools.sock')));

  const buildAdapter = (): SandboxAdapter =>
    buildProcessSandboxAdapter({
      recorder: ctx.recorder,
      rootDir,
      toolTarget: () => ({ path: join(rootDir, 'tools.sock') }),
    });
  const adapter = buildAdapter();
  const createSandbox = async (spec: SandboxSpec): Promise<Sandbox> => {
    const sandbox = await adapter.create(spec);

    stack.defer(() => removeSandbox(sandbox));
    return sandbox;
  };

  return { ...ctx, adapter, rootDir, createSandbox, buildAdapter };
}

// a tool endpoint that answers with the path and bearer token it saw; the result stops it
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

// the destroy stops the processes first; its record may meet a writer that already stopped
async function removeSandbox(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.destroy();
  } catch {
    // the processes are gone; only the record failed
  }
}
