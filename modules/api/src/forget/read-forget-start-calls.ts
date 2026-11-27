import type { APIContext } from '../types';
import { readForgetStarted } from './read-forget-started';

// The start record of a brief's forget keeps the starter's task.start calls that hold the brief, so
// a rerun after a crash destroys the same keys once the brief is no longer readable.
export async function readForgetStartCalls(
  context: Pick<APIContext, 'log'>,
  recordSequence: number,
): Promise<readonly number[]> {
  const started = await readForgetStarted(context, recordSequence);

  return started?.startCallSequences ?? [];
}
