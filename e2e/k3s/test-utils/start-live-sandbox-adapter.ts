import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PublicEgressConfig } from '../../../adapters/sandbox-imp/src/index';
import { buildImpPort, buildImpSandboxAdapter } from '../../../adapters/sandbox-imp/src/index';
import { logProjections, startWriter } from '../../../modules/log/src/index';
import type { SandboxAdapter } from '../../../modules/sandbox/src/index';
import { buildSandboxRecorder, sandboxesProjection } from '../../../modules/sandbox/src/index';

export interface LiveSandboxOptions {
  readonly url: string;
  readonly token: string;
  readonly publicEgress: PublicEgressConfig | null;
}

export interface LiveSandboxAdapter {
  readonly adapter: SandboxAdapter;

  // the scratch directory that holds the adapter's own database
  readonly dataDir: string;

  // runs each cleanup in reverse order when the test ends: a fetch tool to stop, a sandbox to destroy
  readonly stack: AsyncDisposableStack;
}

// Starts nixie's imp adapter against a deployed impd, recording its sandboxes in a database of its
// own in a scratch directory, so a check never lists or removes nixie's sandboxes. It must run
// inside a test, which removes the directory and everything the stack holds when it ends.
export async function startLiveSandboxAdapter(
  options: LiveSandboxOptions,
): Promise<LiveSandboxAdapter> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-live-sandboxes-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
  const adapter = buildImpSandboxAdapter({
    port: buildImpPort({ url: options.url, token: options.token }),
    recorder: buildSandboxRecorder({
      log: { writer, deploymentKey, projections: [...logProjections, sandboxesProjection] },
      definitions: () => ({ snapshotHash: 'sha256:live-check' }),
    }),
    config: { publicEgress: options.publicEgress },
    toolTarget: () => ({ path: '/nonexistent.sock' }),
  });

  return { adapter, dataDir, stack };
}
