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

  readonly secret: string;
}

interface IsolationAdapter {
  readonly createSandbox: (spec: SandboxSpec) => Promise<Sandbox>;
}

export function setupIsolationAdapter(options: IsolationAdapterOptions): Promise<IsolationAdapter> {
  const stack = new AsyncDisposableStack();

  const started: Promise<unknown>[] = [];

  onTestFinished(async () => {
    await Promise.allSettled(started);
    await stack.disposeAsync();
  });

  const setup = createIsolationAdapter(options, (cleanup) => {
    stack.defer(cleanup);
  });

  started.push(setup);

  return setup;
}

async function createIsolationAdapter(
  options: IsolationAdapterOptions,
  defer: (cleanup: () => Promise<void>) => void,
): Promise<IsolationAdapter> {
  const recorder = await setupTestRecorder();
  const directory = await mkdtemp(join(tmpdir(), 'nixie-isolation-'));

  defer(() => rm(directory, { recursive: true, force: true }));
  startStubToolEndpoint(join(directory, 'tools.sock'));

  await createTestSecret(options);

  const sandboxes = buildSandboxTracker(
    buildImpSandboxAdapter({
      port: options.port,
      recorder: recorder.recorder,
      config: { publicEgress: options.publicEgress },
      toolTarget: () => ({ path: join(directory, 'tools.sock') }),
      ...(options.guestToolPort === undefined ? {} : { guestToolPort: options.guestToolPort }),
    }),
  );

  defer(() => sandboxes.removeAll());

  return { createSandbox: sandboxes.create };
}

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

  onTestFinished(async () => {
    await Promise.allSettled([added]);

    const left = await options.port.readSecretHosts(name);

    if (left !== null) {
      await options.removeSecret(name);
    }
  });

  await added;
}

interface SandboxTracker {
  readonly create: (spec: SandboxSpec) => Promise<Sandbox>;

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
