import type { ContextSize } from './types';

// Whether a turn that ended with this context compacts its session: its context is at or past the
// threshold's share of the window. A turn that reported no context never does.
export function isCompactionDue(context: ContextSize | null, threshold: number): boolean {
  return context !== null && context.size >= threshold * context.window;
}
