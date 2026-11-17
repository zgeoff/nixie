import { createHash } from 'node:crypto';
import type { Trigger } from '@heynixie/contract';
import { toCanonicalJSON } from '@heynixie/triggers';

export interface ReminderVersion {
  readonly name: string;
  readonly note: string;
  readonly trigger: Trigger;
}

export function buildReminderHash(version: ReminderVersion): string {
  return createHash('sha256').update(toCanonicalJSON(version)).digest('hex');
}
