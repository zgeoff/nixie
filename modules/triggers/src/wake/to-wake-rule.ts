import { wakeMatchSchema } from '../record/wake-match-schema';
import type { TriggersTables, WakeRule } from '../types';

// The rule that a row of wake_rules holds.
export function toWakeRule(row: TriggersTables['wake_rules']): WakeRule {
  return {
    ruleID: row.rule_id,
    shortID: row.short_id,
    mailbox: { kind: 'mail' },
    match: wakeMatchSchema.parse(JSON.parse(row.match)),
    target:
      row.target_kind === 'conversation'
        ? { kind: 'conversation' }
        : { kind: 'task', taskID: row.target_task_id },
    setBy: row.set_by,
    expiresAt: row.expires_at,
    windowMs: row.window_ms,
    origin: row.origin,
    createdAt: row.created_at,
  };
}
