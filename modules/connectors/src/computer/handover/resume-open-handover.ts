import type { Log } from '@heynixie/log';
import { readOpenHandover } from './read-open-handover';
import type { Handover } from './types';

// An ask lives in memory, so one that was open when nixie stopped is open again now, with the time
// it had left counted from its record. An ask whose time has passed expires at once.
export async function resumeOpenHandover(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  handover: Pick<Handover, 'resume'>,
): Promise<void> {
  const open = await readOpenHandover(log);

  if (open !== null) {
    handover.resume(open.askedAtMs);
  }
}
