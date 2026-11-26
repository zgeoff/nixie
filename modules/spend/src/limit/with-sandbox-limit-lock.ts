const tails = new Map<string, Promise<void>>();

// Runs a limit write of one sandbox after every earlier one has finished, so the gateway never
// applies two limits of a sandbox out of the order in which their checks passed. A write holds the
// lock from its freshness check until the gateway answered.
export async function withSandboxLimitLock<Result>(
  sandbox: string,
  run: () => Promise<Result>,
): Promise<Result> {
  const previous = tails.get(sandbox);
  const release = Promise.withResolvers<void>();

  tails.set(sandbox, release.promise);

  await previous;

  try {
    return await run();
  } finally {
    release.resolve();

    if (tails.get(sandbox) === release.promise) {
      tails.delete(sandbox);
    }
  }
}
