import type { LogRecord } from '@heynixie/log';
import type { RuleSource } from '@heynixie/policy';

// Where the content of these records came from, sorted and with no repeat.
export function collectRecordSources(records: readonly LogRecord[]): RuleSource[] {
  const sources = records.flatMap((record): RuleSource[] => {
    if (record.kind === 'task_message') {
      return ['task'];
    }

    if (record.contentSource === 'owner') {
      return ['owner'];
    }

    if (record.contentSource === 'owner_data') {
      return ['own_data'];
    }

    return record.contentSource === 'untrusted' ? ['outside'] : [];
  });

  return [...new Set(sources)].toSorted();
}
