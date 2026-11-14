import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

export type MomentTextField = 'title' | 'note' | 'reflection';

// A moment's text lives only in its own records, so a destroy that removed their keys leaves null.
export async function readMomentText(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
  field: MomentTextField,
): Promise<string | null> {
  const [entry] = await readRecords(log, {
    afterSequence: sequence - 1,
    beforeSequence: sequence + 1,
    limit: 1,
  });

  const erasable = entry?.record.erasable;

  if (erasable?.status !== 'readable') {
    return null;
  }

  const value = erasable.fields[field];

  return typeof value === 'string' ? value : null;
}
