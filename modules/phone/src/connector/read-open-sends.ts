import type { ActionsTables } from '@heynixie/actions';
import { readRecords } from '@heynixie/log';
import type { Log } from '@heynixie/log';
import type { TextRequest } from '../types';
import { isJSONObject } from './is-json-object';
import { parseSendArguments } from './parse-send-arguments';
import { phoneToolNames } from './phone-tool-names';

// The text that each other send of the assistant's phone has begun and not settled. A send that no
// attempt has begun sends nothing, so it is left out.
export async function readOpenSends(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  excludeActionID: string,
): Promise<readonly TextRequest[]> {
  const rows = await log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('queued_sequence')
    .where('tool', '=', phoneToolNames.send)
    .where('action_id', '!=', excludeActionID)
    .where('status', 'in', ['pending', 'unknown'])
    .where('attempt_count', '>', 0)
    .execute();

  if (rows.length === 0) {
    return [];
  }

  const queued = await readRecords(log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.queued_sequence),
    limit: rows.length,
  });

  return queued.flatMap((entry) => {
    const erasable = entry.record.erasable;
    const args = erasable.status === 'readable' ? erasable.fields['arguments'] : undefined;
    const text = isJSONObject(args) ? parseSendArguments(args) : null;

    return text === null ? [] : [text];
  });
}
