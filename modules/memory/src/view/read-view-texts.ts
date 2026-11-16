import type { Log } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { VersionValueRow } from '../version/read-version-values';
import { readVersionValues } from '../version/read-version-values';
import type { ViewText } from './memory-view';

export interface OpenedVersion {
  readonly text: ViewText;

  readonly evidenceQuote: string | null;

  // a purge removed the text, which the status reports as shredded
  readonly isRemoved: boolean;
}

export async function readViewTexts(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  db: Kysely<unknown>,
  rows: readonly VersionValueRow[],
): Promise<readonly OpenedVersion[]> {
  const values = await readVersionValues(log, db, rows);

  return values.map((value): OpenedVersion => {
    if (value.status === 'readable') {
      return {
        text: { status: 'readable', text: value.text.text },
        evidenceQuote: value.text.evidenceQuote,
        isRemoved: false,
      };
    }

    return {
      text: { status: value.status === 'unreadable' ? 'unreadable' : 'shredded' },
      evidenceQuote: null,
      isRemoved: value.status === 'removed',
    };
  });
}
