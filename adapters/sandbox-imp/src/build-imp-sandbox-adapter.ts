import type {
  Sandbox,
  SandboxAdapter,
  SandboxRecorder,
  SandboxRow,
  SandboxSpec,
  ToolTargetResolver,
} from '@heynixie/sandbox';
import { createSandboxID, stopGraceMs } from '@heynixie/sandbox';
import { buildImpPolicy } from './build-imp-policy';
import type { SleepRegistry } from './build-imp-sandbox';
import { buildImpSandbox } from './build-imp-sandbox';
import { buildRouteRegistry } from './build-route-registry';
import { buildSleepRegistry } from './build-sleep-registry';
import type { PublicEgressConfig } from './parse-imp-config';
import { requireImpSpec } from './require-imp-spec';
import type { ImpPort } from './types';

export interface ImpSandboxOptions {
  readonly port: ImpPort;
  readonly recorder: SandboxRecorder;
  readonly config: { readonly publicEgress: PublicEgressConfig | null };

  readonly toolTarget: ToolTargetResolver;

  readonly guestToolPort?: number;
  readonly killGraceMs?: number;
}

export function buildImpSandboxAdapter(options: ImpSandboxOptions): SandboxAdapter {
  const guestToolPort = options.guestToolPort ?? 8901;

  const routes = buildRouteRegistry({
    port: options.port,
    toolTarget: options.toolTarget,
    guestToolPort,
  });

  const sleeping = buildSleepRegistry();

  const getSandbox = (id: string, spec: SandboxSpec, isRetired = false): Sandbox =>
    buildImpSandbox({
      sleeping,
      port: options.port,
      recorder: options.recorder,
      routes,
      guestToolPort,
      killGraceMs: options.killGraceMs ?? stopGraceMs,
      id,
      spec,
      isRetired,
    });

  const getRowSandbox = makeRowSandboxReader(options.port, sleeping, getSandbox);

  return {
    id: 'imp',
    boundary: 'microvm',
    create: (spec) =>
      createImpSandbox(options, spec, {
        getSandbox,
        removeSandbox: async (id) => {
          await routes.close(id);
          await options.port.removeImp(id);
        },
      }),
    read: async (id) => {
      const row = await options.recorder.readRow('imp', id);

      return row ? getRowSandbox(row) : null;
    },
    list: async (owner) => {
      const rows = await options.recorder.list('imp', owner);

      return Promise.all(rows.map((row) => getRowSandbox(row)));
    },
    addSecret: makeSecretAdder(options.port),
    addImage: makeImageAdder(options.port),
    checkRuntime: makeRuntimeChecker(options.port),
  };
}

function makeRowSandboxReader(
  port: ImpPort,
  sleeping: SleepRegistry,
  getSandbox: (id: string, spec: SandboxSpec, isRetired: boolean) => Sandbox,
): (row: SandboxRow) => Promise<Sandbox> {
  return async (row) => {
    const isBackedUp = await port.readImpBackup(row.sandboxID);

    sleeping.setAsleep(row.sandboxID, row.state === 'sleeping');

    return getSandbox(row.sandboxID, row.spec, isBackedUp === true);
  };
}

interface ImpSandboxes {
  readonly getSandbox: (id: string, spec: SandboxSpec) => Sandbox;
  readonly removeSandbox: (id: string) => Promise<void>;
}

async function createImpSandbox(
  options: ImpSandboxOptions,
  spec: SandboxSpec,
  sandboxes: ImpSandboxes,
): Promise<Sandbox> {
  await requireImpSpec(options.port, options.config.publicEgress, spec);

  const sandbox = sandboxes.getSandbox(createSandboxID(), spec);

  await options.recorder.write({ event: 'created', sandboxID: sandbox.id, adapter: 'imp', spec });

  try {
    return await setupImp(options, sandbox);
  } catch (error) {
    await sandboxes.removeSandbox(sandbox.id);

    await options.recorder.write({
      event: 'destroyed',
      sandboxID: sandbox.id,
      reason: 'create_failed',
    });

    throw error;
  }
}

async function setupImp(options: ImpSandboxOptions, sandbox: Sandbox): Promise<Sandbox> {
  await options.port.createImp({
    name: sandbox.id,
    image: sandbox.spec.image,
    vcpus: sandbox.spec.limits.vcpus,
    memoryMib: sandbox.spec.limits.memoryMiB,
    diskMib: sandbox.spec.limits.diskMiB,
    policy: buildImpPolicy(sandbox.spec),
    backup: false,
  });

  for (const grant of sandbox.spec.grants) {
    await options.port.addGrant(sandbox.id, grant.secret);

    await options.recorder.write({
      event: 'granted',
      sandboxID: sandbox.id,
      secret: grant.secret,
      host: grant.host,
    });
  }

  await sandbox.toolRoute();

  return sandbox;
}

function makeSecretAdder(port: ImpPort): SandboxAdapter['addSecret'] {
  return async (secret) => {
    if ((await port.readSecretHosts(secret.name)) !== null) {
      return;
    }

    await port.addSecret({
      name: secret.name,
      value: secret.value,
      host: secret.host,
      ...(secret.header === 'bearer'
        ? { header: 'authorization', scheme: 'bearer' }
        : { header: 'x-api-key', scheme: 'raw' }),
    });
  };
}

function makeImageAdder(port: ImpPort): SandboxAdapter['addImage'] {
  return async (image) => {
    const digest = findPinnedDigest(image.ref);

    if (digest === undefined) {
      throw new Error(`the image ${image.name} is not pinned by digest: ${image.ref}`);
    }

    const images = await port.listImages();

    const held = images.find((row) => row.name === image.name);

    if (held === undefined) {
      await createImpImage(port, { name: image.name, digest, ref: image.ref });
    } else if (held.digest !== digest && findPinnedDigest(held.ref) !== digest) {
      throw new Error(
        `impd holds the image ${image.name} at ${held.digest} from ${held.ref}, not ${digest}`,
      );
    }
  };
}

function findPinnedDigest(ref: string): string | undefined {
  return /@(?<digest>sha256:[\da-f]{64})$/u.exec(ref)?.groups?.['digest'];
}

// impd's refusal names neither the image nor the ref, so the log could not say which image the host
// owner must add.
async function createImpImage(
  port: ImpPort,
  image: Parameters<ImpPort['addImage']>[0],
): Promise<void> {
  try {
    await port.addImage(image);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`impd did not add the image ${image.name} from ${image.ref}: ${reason}`, {
      cause: error,
    });
  }
}

function makeRuntimeChecker(port: ImpPort): SandboxAdapter['checkRuntime'] {
  return async (signal) => {
    try {
      await port.readFeatures(signal);

      return { isReady: true, reason: null };
    } catch {
      return { isReady: false, reason: 'impd does not answer' };
    }
  };
}
