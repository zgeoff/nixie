import type { EnvelopeRecord, JSONObject, JSONValue, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { SandboxTables } from './types';

// One row per sandbox that nixie made and has not destroyed. A created record adds the row, a sleep
// and a wake set its state, and a destroy removes it, so the table answers crash recovery's question
// of which sandboxes still stand. A grant changes no row.
export const sandboxesProjection: Projection = {
  table: 'sandboxes',
  keyColumn: 'sandbox_id',
  fold: async (tx, record) => {
    const sandboxID = record.payload['sandboxID'];

    if (!record.kind.startsWith('sandbox.') || typeof sandboxID !== 'string') {
      return [];
    }
    const changed = await applySandboxRecord(tx.$extendTables<SandboxTables>(), sandboxID, record);

    return changed ? [sandboxID] : [];
  },
};

// applies one sandbox record to its row, and tells whether the row changed
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
  const spec = record.payload['spec'];
  const adapter = record.payload['adapter'];

  if (
    !isJSONObject(spec) ||
    typeof adapter !== 'string' ||
    typeof spec['owner'] !== 'string' ||
    typeof spec['kind'] !== 'string'
  ) {
    throw new Error(`record ${record.sequence} holds no sandbox spec`);
  }
  await db
    .insertInto('sandboxes')
    .values({
      sandbox_id: sandboxID,
      adapter,
      owner: spec['owner'],
      kind: spec['kind'],
      state: 'awake',
      spec: JSON.stringify(spec),
      created_sequence: record.sequence,
    })
    .execute();
}

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
