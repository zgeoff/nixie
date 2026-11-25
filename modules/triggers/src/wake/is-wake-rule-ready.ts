import type { LiveWakeRule } from './read-live-wake-rules';

// A rule is ready when it never woke, or its last wake was its window ago or longer.
export function isWakeRuleReady(entry: LiveWakeRule, nowMs: number): boolean {
  return entry.lastWakeAt === null || nowMs - entry.lastWakeAt >= entry.rule.windowMs;
}
