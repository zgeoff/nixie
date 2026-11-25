import { readConnectionRowByID } from '../connection/read-connection-rows';
import type { ServiceContext } from '../service-context';

// Waits until the Forget of a connection has finished, up to the context's limit. Answers whether it
// finished.
export async function waitForForget(
  context: ServiceContext,
  connectionID: string,
): Promise<boolean> {
  const tries = Math.max(1, Math.ceil(context.forgetWaitMs / context.forgetPollMs));

  for (let attempt = 0; attempt < tries; attempt += 1) {
    const row = await readConnectionRowByID(context.log, connectionID);

    if (row === null || row.binding === 'removed') {
      return true;
    }

    await Bun.sleep(context.forgetPollMs);
  }

  return false;
}
