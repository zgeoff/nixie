import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sandboxCreatedCodec } from './sandbox-created-codec';
import { sandboxDestroyedCodec } from './sandbox-destroyed-codec';
import { sandboxGrantedCodec } from './sandbox-granted-codec';
import { sandboxSleptCodec } from './sandbox-slept-codec';
import { sandboxWokenCodec } from './sandbox-woken-codec';
import type { SandboxTables } from './types';

export const sandboxesProjection: Projection = {
  table: 'sandboxes',
  keyColumn: 'sandbox_id',
  fold: async (tx, record) => {
    const sandboxID = findSandboxID(record);

    if (sandboxID === null) {
      return [];
    }

    const changed = await applySandboxRecord(tx.$extendTables<SandboxTables>(), sandboxID, record);

    return changed ? [sandboxID] : [];
  },
};

const sandboxCodecs = [
  sandboxCreatedCodec,
  sandboxGrantedCodec,
  sandboxSleptCodec,
  sandboxWokenCodec,
  sandboxDestroyedCodec,
];

function findSandboxID(record: EnvelopeRecord): string | null {
  const codec = sandboxCodecs.find((candidate) => candidate.kind === record.kind);

  return codec?.tryDecodePartial(record.payload)?.sandboxID ?? null;
}

async function applySandboxRecord(
  db: Transaction<SandboxTables>,
  sandboxID: string,
  record: EnvelopeRecord,
): Promise<boolean> {
  if (record.kind === 'sandbox.created') {
    await writeSandboxRow(db, sandboxID, record);
  } else if (record.kind === 'sandbox.slept' || record.kind === 'sandbox.woken') {
    const state = record.kind === 'sandbox.slept' ? 'sleeping' : 'awake';

    await db.updateTable('sandboxes').set({ state }).where('sandbox_id', '=', sandboxID).execute();
  } else if (record.kind === 'sandbox.destroyed') {
    await db.deleteFrom('sandboxes').where('sandbox_id', '=', sandboxID).execute();
  } else {
    return false;
  }

  return true;
}

async function writeSandboxRow(
  db: Transaction<SandboxTables>,
  sandboxID: string,
  record: EnvelopeRecord,
): Promise<void> {
  const created = sandboxCreatedCodec.decode(record.payload);

  await db
    .insertInto('sandboxes')
    .values({
      sandbox_id: sandboxID,
      adapter: created.adapter,
      owner: created.spec.owner,
      kind: created.spec.kind,
      state: 'awake',
      spec: JSON.stringify(created.spec),
      created_sequence: record.sequence,
    })
    .execute();
}
