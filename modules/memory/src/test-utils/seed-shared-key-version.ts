import { createShortID } from '@heynixie/db';
import type { Log } from '@heynixie/log';
import { createRecordKey, readRecordKeys, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { QuoteEvidence, VersionRef } from '../types';
import { encodeVersionText } from '../version/encode-version-text';

export interface SharedKeyVersion {
  // the item the version extends; leave it out for the item's first version
  readonly target?: VersionRef;
  readonly text: string;
  readonly evidence?: QuoteEvidence;
  readonly evidenceQuote?: string;
}

// Puts a version in the log as a release before the version keys wrote it: its text and its quote
// sit together under the item's own key, and the version has no memory.version_keyed record.
export async function seedSharedKeyVersion(log: Log, input: SharedKeyVersion): Promise<VersionRef> {
  const itemID = input.target?.itemID ?? crypto.randomUUID();
  const version = (input.target?.version ?? 0) + 1;

  if (input.target === undefined) {
    await createRecordKey(log, itemID);
  }

  const keys = await readRecordKeys(log, [itemID]);

  const key = keys.get(itemID);

  invariant(key, `item ${itemID} has no key`);

  const sealed = await encodeVersionText(
    key,
    { itemID, version },
    { text: input.text, evidenceQuote: input.evidenceQuote ?? null, intentQuote: null },
  );

  await writeRecords(log, [
    {
      kind: 'memory.version_added',
      definitions: { snapshotHash: 'sha256:test' },
      contentSource: 'owner',
      payload: {
        itemID,
        version,
        change: input.target === undefined ? 'created' : 'edited',
        state: 'active',
        sealed,
        evidence: input.evidence === undefined ? null : { ...input.evidence },
        intentEvidence: null,
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
        model: null,
        noticeKey: null,
        ...(input.target === undefined ? { shortID: createShortID() } : {}),
      },
    },
  ]);

  return { itemID, version };
}
