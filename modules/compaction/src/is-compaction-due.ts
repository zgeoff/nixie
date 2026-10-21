import type { ContextSize } from './types';

export function isCompactionDue(context: ContextSize | null, threshold: number): boolean {
  return context !== null && context.size >= threshold * context.window;
}
