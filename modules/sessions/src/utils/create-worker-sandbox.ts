import type { Logger } from '@heynixie/logger';
import type { GrantSpec, Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, removeSandboxes } from '@heynixie/sandbox';

export interface WorkerSandboxSpec {
  readonly sandboxes: SandboxAdapter;
  readonly image: string;
  readonly owner: string;
  readonly limits: SandboxLimits;
  readonly modelGrant: GrantSpec;
  readonly log: Logger;
}

export interface WorkerSandbox {
  readonly sandbox: Sandbox;

  // a kept sandbox may sleep since the last process slept it; a new one is awake
  readonly isKept: boolean;
}

export async function createWorkerSandbox(spec: WorkerSandboxSpec): Promise<WorkerSandbox> {
  const wanted = buildSandboxSpec({
    kind: 'worker',
    image: spec.image,
    owner: spec.owner,
    limits: spec.limits,
    modelGrant: spec.modelGrant,
  });

  const existing = await spec.sandboxes.list(spec.owner);

  const kept = findKeptSandbox(existing, wanted);

  await removeSandboxes(
    existing.filter((sandbox) => sandbox !== kept),
    spec.log,
  );

  return kept === undefined
    ? { sandbox: await spec.sandboxes.create(wanted), isKept: false }
    : { sandbox: kept, isKept: true };
}
