import { formatSpendStopRefusal, readSpendStop } from '@heynixie/spend';
import type { APIContext } from '../types';

// The message of the refusal while the spending stop stands, or null when it does not. A Resume
// never restarts turns while the stop stands, whatever the pause's cause.
export async function readResumeRefusal(context: APIContext): Promise<string | null> {
  if (context.spend === undefined) {
    return null;
  }

  const stop = await readSpendStop(context.spend);

  return stop.state === 'clear' ? null : formatSpendStopRefusal(stop);
}
