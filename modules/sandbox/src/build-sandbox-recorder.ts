import type { Definitions, JSONObject, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { sandboxesProjection } from './sandboxes-projection';
import type {
  SandboxEvent,
  SandboxRecorder,
  SandboxRow,
  SandboxSpec,
  SandboxTables,
} from './types';

export interface SandboxRecorderOptions {
  // a log whose projections include sandboxesProjection
  readonly log: Log;

  // the definitions in force, which every record carries
  readonly definitions: () => Definitions;
}

// Builds the recorder that adapters write their lifecycle through: each event is one record of kind
// sandbox.<event>, and the sandboxes projection answers find and list.
export function buildSandboxRecorder(options: SandboxRecorderOptions): SandboxRecorder {
  if (!options.log.projections.includes(sandboxesProjection)) {
    throw new Error('the log passed to the sandbox recorder lacks the sandboxes projection');
  }
  const query = options.log.writer.db
    .$extendTables<SandboxTables>()
    .selectFrom('sandboxes')
    .select(['sandbox_id', 'adapter', 'owner', 'state', 'spec']);

  return {
    write: async (event) => {
      await writeRecords(options.log, [
        {
          kind: `sandbox.${event.event}`,
          definitions: options.definitions(),
          payload: toPayload(event),
        },
      ]);
    },
    findRow: async (adapter, sandboxID) => {
      const row = await query
        .where('adapter', '=', adapter)
        .where('sandbox_id', '=', sandboxID)
        .executeTakeFirst();

      return row ? toSandboxRow(row) : null;
    },
    list: async (adapter, owner) => {
      const rows = await query
        .where('adapter', '=', adapter)
        .where('owner', '=', owner)
        .orderBy('created_sequence')
        .execute();

      return rows.map((row) => toSandboxRow(row));
    },
  };
}

// The payload holds IDs, names and states. A grant's env holds placeholders, never a credential.
function toPayload(event: SandboxEvent): JSONObject {
  const { event: _kind, ...fields } = event;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every event field is plain JSON
  return fields as unknown as JSONObject;
}

interface Row {
  readonly sandbox_id: string;
  readonly adapter: string;
  readonly owner: string;
  readonly state: 'awake' | 'sleeping';
  readonly spec: string;
}

function toSandboxRow(row: Row): SandboxRow {
  return {
    sandboxID: row.sandbox_id,
    adapter: row.adapter,
    owner: row.owner,
    state: row.state,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the projection wrote a SandboxSpec
    spec: JSON.parse(row.spec) as SandboxSpec,
  };
}
