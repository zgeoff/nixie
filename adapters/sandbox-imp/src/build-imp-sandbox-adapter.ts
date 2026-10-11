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

  // the tool endpoint for a sandbox's run, where the reverse forward delivers each connection
  readonly toolTarget: ToolTargetResolver;

  // the loopback port in the imp that the reverse forward listens on
  readonly guestToolPort?: number;
  readonly killGraceMs?: number;
}

// The sandbox adapter on imp: each sandbox is one imp named by its sandbox ID. The broker injects
// each grant from the host, and the route to nixie's tools is a reverse forward from the imp's
// loopback over impd, never an allow entry.
export function buildImpSandboxAdapter(options: ImpSandboxOptions): SandboxAdapter {
  const guestToolPort = options.guestToolPort ?? 8901;
  const routes = buildRouteRegistry({
    port: options.port,
    toolTarget: options.toolTarget,
    guestToolPort,
  });
  const sleeping = buildSleepRegistry();
  const getSandbox = (id: string, spec: SandboxSpec): Sandbox =>
    buildImpSandbox({
      sleeping,
      port: options.port,
      recorder: options.recorder,
      routes,
      guestToolPort,
      killGraceMs: options.killGraceMs ?? stopGraceMs,
      id,
      spec,
    });
  const getRowSandbox = (row: SandboxRow): Sandbox => {
    sleeping.setAsleep(row.sandboxID, row.state === 'sleeping');
    return getSandbox(row.sandboxID, row.spec);
  };

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
    get: async (id) => {
      const row = await options.recorder.findRow('imp', id);

      return row ? getRowSandbox(row) : null;
    },
    list: async (owner) => {
      const rows = await options.recorder.list('imp', owner);

      return rows.map((row) => getRowSandbox(row));
    },
    addSecret: makeSecretAdder(options.port),
    addImage: makeImageAdder(options.port),
    checkRuntime: makeRuntimeChecker(options.port),
  };
}

// impd keeps an image under its name, and a release names each image by its kind and digest, so an
// image added once is never pulled again. A name impd holds at another digest is refused, because a
// spec that names it would run an image the manifest never pinned.
function makeImageAdder(port: ImpPort): SandboxAdapter['addImage'] {
  return async (image) => {
    const digest = /@(?<digest>sha256:[\da-f]{64})$/u.exec(image.ref)?.groups?.['digest'];

    if (digest === undefined) {
      throw new Error(`the image ${image.name} is not pinned by digest: ${image.ref}`);
    }
    const images = await port.listImages();
    const held = images.find((row) => row.name === image.name);

    if (held === undefined) {
      await port.addImage({ name: image.name, digest, ref: image.ref });
    } else if (held.digest !== digest) {
      throw new Error(`impd holds the image ${image.name} at ${held.digest}, not ${digest}`);
    }
  };
}

// A secret stays under its name once stored, because a sandbox's grant may name it; a caller with a
// new value stores it under a new name.
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

// Refuses a spec before it writes anything, then writes the created record before impd makes the
// imp, so recovery finds an imp that a crash cut short. A failure removes the imp and records the
// sandbox as destroyed.
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
  });
  for (const grant of sandbox.spec.grants) {
    // oxlint-disable-next-line no-await-in-loop -- one grant and its record at a time, in order
    await options.port.addGrant(sandbox.id, grant.secret);

    // oxlint-disable-next-line no-await-in-loop -- one grant and its record at a time, in order
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

// the runtime is ready while impd answers
function makeRuntimeChecker(port: ImpPort): SandboxAdapter['checkRuntime'] {
  return async () => {
    try {
      await port.readFeatures();
      return { isReady: true, reason: null };
    } catch {
      // the health endpoint answers without a session, so the reason never quotes impd's error
      return { isReady: false, reason: 'impd does not answer' };
    }
  };
}
