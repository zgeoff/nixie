import type { SandboxAdapter } from '@heynixie/sandbox';

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
