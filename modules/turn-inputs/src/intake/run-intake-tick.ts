import type { TurnInputsContext } from '../types';
import { listSpoolFiles } from './list-spool-files';
import { takeInSpoolFile } from './take-in-spool-file';

// Reads each source's folder once. Each file is its own lane task, so a close or a forget waits only
// for the file in flight.
export async function runIntakeTick(ctx: TurnInputsContext): Promise<void> {
  if (ctx.config === null || ctx.open.size === 0) {
    return;
  }

  for (const source of Object.values(ctx.config.sources)) {
    const files = await listSpoolFiles(source.directory);

    await Promise.all(
      files.map((file) =>
        ctx.lane.run(() => takeInSpoolFile(ctx, { ...file, directory: source.directory })),
      ),
    );
  }
}
