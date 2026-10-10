import type {
  Sandbox,
  SandboxAdapter,
  SandboxRecorder,
  SandboxSpec,
  ToolTargetResolver,
} from '@heynixie/sandbox';
import { createSandboxID, stopGraceMs } from '@heynixie/sandbox';
import { buildImpPolicy } from './build-imp-policy';
import { buildImpSandbox } from './build-imp-sandbox';
import { buildRouteRegistry } from './build-route-registry';
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
  const getSandbox = (id: string, spec: SandboxSpec): Sandbox =>
    buildImpSandbox({
      port: options.port,
      recorder: options.recorder,
      routes,
      guestToolPort,
      killGraceMs: options.killGraceMs ?? stopGraceMs,
      id,
      spec,
    });

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

      return row ? getSandbox(row.sandboxID, row.spec) : null;
    },
    list: async (owner) => {
      const rows = await options.recorder.list('imp', owner);

      return rows.map((row) => getSandbox(row.sandboxID, row.spec));
    },
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
