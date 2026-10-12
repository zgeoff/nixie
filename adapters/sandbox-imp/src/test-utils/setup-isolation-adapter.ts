import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { setupTestRecorder, startStubToolEndpoint } from '@heynixie/sandbox/test-utils';
import { buildImpSandboxAdapter } from '../build-imp-sandbox-adapter';
import type { PublicEgressConfig } from '../parse-imp-config';
import type { ImpPort } from '../types';

interface IsolationAdapterOptions {
  readonly port: ImpPort;
  readonly removeSecret: (name: string) => Promise<void>;
  readonly publicEgress: PublicEgressConfig | null;
  readonly guestToolPort?: number;

  // the name of the model-host secret to add, which impd must not hold yet
  readonly secret: string;
}

interface IsolationAdapter {
  // creates an imp that is destroyed when the test finishes
  readonly createSandbox: (spec: SandboxSpec) => Promise<Sandbox>;
}

// Sets up the imp adapter on a fresh recorder and the stub tool endpoint, and adds the model-host
// secret with a dummy value. The stack's hook registers first and waits for every create still
// running; hooks run first in, first out, so each imp goes before the writer stops.
export async function setupIsolationAdapter(
  options: IsolationAdapterOptions,
): Promise<IsolationAdapter> {
  const stack = new AsyncDisposableStack();
  const creating = new Set<Promise<unknown>>();

  onTestFinished(async () => {
    await Promise.allSettled(creating);
    await stack.disposeAsync();
  });

  const recorder = await setupTestRecorder();
  const dir = await mkdtemp(join(tmpdir(), 'nixie-isolation-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));
  startStubToolEndpoint(join(dir, 'tools.sock'));

  await createTestSecret(options);

  const adapter = buildImpSandboxAdapter({
    port: options.port,
    recorder: recorder.recorder,
    config: { publicEgress: options.publicEgress },
    toolTarget: () => ({ path: join(dir, 'tools.sock') }),
    ...(options.guestToolPort === undefined ? {} : { guestToolPort: options.guestToolPort }),
  });

  return {
    createSandbox: (spec) => {
      const created = createOwnedSandbox(adapter, spec, (sandbox) => {
        stack.defer(() => sandbox.destroy());
      });

      creating.add(created);
      return created;
    },
  };
}

async function createOwnedSandbox(
  adapter: SandboxAdapter,
  spec: SandboxSpec,
  onCreated: (sandbox: Sandbox) => void,
): Promise<Sandbox> {
  const sandbox = await adapter.create(spec);

  onCreated(sandbox);
  return sandbox;
}

// A name impd holds already is not this run's, so the add refuses it. Once the run has seen the
// name free, whatever impd holds under it at the end is the run's, which covers an add that failed
// after impd stored the secret.
async function createTestSecret(options: IsolationAdapterOptions): Promise<void> {
  const name = options.secret;
  const held = await options.port.readSecretHosts(name);

  if (held !== null) {
    throw new Error(`impd holds a secret named ${name} that this run did not add`);
  }
  const added = options.port.addSecret({
    name,
    value: 'nixie-isolation-dummy',
    host: 'api.anthropic.com',
    header: 'x-api-key',
    scheme: 'raw',
  });

  // an add that outlives the test stores the secret late, so the check waits for it to settle
  onTestFinished(async () => {
    await Promise.allSettled([added]);

    const left = await options.port.readSecretHosts(name);

    if (left !== null) {
      await options.removeSecret(name);
    }
  });
  await added;
}
