import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { setupTestRecorder, startStubToolEndpoint } from '@heynixie/sandbox/test-utils';
import { buildImpSandboxAdapter } from '../build-imp-sandbox-adapter';
import type { PublicEgressConfig } from '../parse-imp-config';
import type { ImpPort } from '../types';
import { removeOwnedSandboxes } from './remove-owned-sandboxes';

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
// secret with a dummy value. The stack's hook registers first and waits for a setup that outlives
// the test; hooks run first in, first out, so each imp goes before the writer stops.
export function setupIsolationAdapter(options: IsolationAdapterOptions): Promise<IsolationAdapter> {
  const stack = new AsyncDisposableStack();

  const started: Promise<unknown>[] = [];

  onTestFinished(async () => {
    await Promise.allSettled(started);
    await stack.disposeAsync();
  });

  const setup = buildIsolationAdapter(options, (cleanup) => {
    stack.defer(cleanup);
  });

  started.push(setup);

  return setup;
}

async function buildIsolationAdapter(
  options: IsolationAdapterOptions,
  defer: (cleanup: () => Promise<void>) => void,
): Promise<IsolationAdapter> {
  const recorder = await setupTestRecorder();
  const dir = await mkdtemp(join(tmpdir(), 'nixie-isolation-'));

  defer(() => rm(dir, { recursive: true, force: true }));
  startStubToolEndpoint(join(dir, 'tools.sock'));

  await createTestSecret(options);

  const sandboxes = buildSandboxTracker(
    buildImpSandboxAdapter({
      port: options.port,
      recorder: recorder.recorder,
      config: { publicEgress: options.publicEgress },
      toolTarget: () => ({ path: join(dir, 'tools.sock') }),
      ...(options.guestToolPort === undefined ? {} : { guestToolPort: options.guestToolPort }),
    }),
  );

  defer(() => sandboxes.removeAll());

  return { createSandbox: sandboxes.create };
}

interface SandboxTracker {
  readonly create: (spec: SandboxSpec) => Promise<Sandbox>;

  // waits for every create still running, then destroys every imp of an owner the test used
  readonly removeAll: () => Promise<void>;
}

function buildSandboxTracker(adapter: SandboxAdapter): SandboxTracker {
  const creating = new Set<Promise<unknown>>();
  const owners = new Set<string>();

  return {
    create: (spec) => {
      const created = adapter.create(spec);

      owners.add(spec.owner);
      creating.add(created);

      return created;
    },
    removeAll: async () => {
      await Promise.allSettled(creating);

      await removeOwnedSandboxes(adapter, [...owners]);
    },
  };
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
