import { isCompactionDue } from './is-compaction-due';
import type { CompactionSettings, ContextSize } from './types';

// The tokens left before a turn's end compacts the session, when a turn that ended with this
// context is at or past the heads-up and still under the threshold. A context past the threshold
// compacts at once, so it gets no heads-up, and a turn that reported no context gets none.
export function findCompactionHeadsUp(
  context: ContextSize | null,
  settings: Pick<CompactionSettings, 'threshold' | 'headsUp'>,
): number | null {
  if (context === null || !isCompactionDue(context, settings.headsUp)) {
    return null;
  }

  if (isCompactionDue(context, settings.threshold)) {
    return null;
  }

  return Math.ceil(settings.threshold * context.window) - context.size;
}
