import { isCompactionDue } from './is-compaction-due';
import type { CompactionSettings, ContextSize } from './types';

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
