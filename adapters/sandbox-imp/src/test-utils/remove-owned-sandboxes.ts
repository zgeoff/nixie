import type { SandboxAdapter } from '@heynixie/sandbox';

// Destroys every imp the recorder holds for the owners. A create whose rollback failed leaves its
// imp recorded, so the sweep reaches it. Each failure is reported once all have run.
export async function removeOwnedSandboxes(
  adapter: SandboxAdapter,
  owners: readonly string[],
): Promise<void> {
  const listed = await Promise.all(owners.map((owner) => adapter.list(owner)));
  const sandboxes = listed.flat();
  const results = await Promise.allSettled(sandboxes.map((sandbox) => sandbox.destroy()));
  const errors = results.flatMap((result): unknown[] =>
    result.status === 'rejected' ? [result.reason] : [],
  );

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} isolation imps failed to destroy`);
  }
}
