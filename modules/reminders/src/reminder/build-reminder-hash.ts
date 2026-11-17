import { createHash } from 'node:crypto';
import type { Trigger } from '@heynixie/contract';
import { toCanonicalJSON } from '@heynixie/triggers';

export interface ReminderVersion {
  readonly name: string;
  readonly note: string;
  readonly trigger: Trigger;
}

// Hashes the version's content alone, so the same name, note and trigger hash the same on every
// path that writes it, whatever else the caller passes along.
export function buildReminderHash(version: ReminderVersion): string {
  const content = { name: version.name, note: version.note, trigger: version.trigger };

  return createHash('sha256').update(toCanonicalJSON(content)).digest('hex');
}
