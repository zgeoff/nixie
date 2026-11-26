import type {
  Done,
  NotFound,
  RevisionChanged,
  SandboxLimit,
  SpendGateway,
  Unreachable,
} from '../types';

// Sets a sandbox's limit only while no other write has changed it since the read that comes first.
// A call that timed out can still land later, and its revision then no longer matches, so the
// gateway refuses it in place of putting back an older limit. The caller holds the sandbox's lock.
export async function writeSandboxLimit(
  gateway: SpendGateway,
  sandbox: string,
  limit: SandboxLimit | null,
): Promise<Done | NotFound | RevisionChanged | Unreachable> {
  const read = await gateway.readSandbox(sandbox);

  if (read.kind !== 'ok') {
    return read;
  }

  return gateway.patchSandbox(sandbox, limit, read.value.limitRevision);
}
