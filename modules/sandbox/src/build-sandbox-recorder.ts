import type { Definitions, JSONObject, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { sandboxCreatedCodec } from './sandbox-created-codec';
import { sandboxDestroyedCodec } from './sandbox-destroyed-codec';
import { sandboxGrantedCodec } from './sandbox-granted-codec';
import type { SandboxRecordKind } from './sandbox-record-kind';
import { sandboxSleptCodec } from './sandbox-slept-codec';
import { sandboxWokenCodec } from './sandbox-woken-codec';
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
        { ...toRecordInput(event), definitions: options.definitions() },
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

interface EventRecord {
  readonly kind: SandboxRecordKind;
  readonly payload: JSONObject;
}

// The payload holds IDs, names and states, and never the event's own name, which the kind holds. A
// grant's env holds placeholders, never a credential.
function toRecordInput(event: SandboxEvent): EventRecord {
  if (event.event === 'created') {
    return {
      kind: sandboxCreatedCodec.kind,
      payload: sandboxCreatedCodec.encode({
        sandboxID: event.sandboxID,
        adapter: event.adapter,
        spec: event.spec,
      }),
    };
  }

  if (event.event === 'granted') {
    return {
      kind: sandboxGrantedCodec.kind,
      payload: sandboxGrantedCodec.encode({
        sandboxID: event.sandboxID,
        secret: event.secret,
        host: event.host,
      }),
    };
  }

  if (event.event === 'destroyed') {
    return {
      kind: sandboxDestroyedCodec.kind,
      payload: sandboxDestroyedCodec.encode({ sandboxID: event.sandboxID, reason: event.reason }),
    };
  }

  const codec = event.event === 'slept' ? sandboxSleptCodec : sandboxWokenCodec;

  return { kind: codec.kind, payload: codec.encode({ sandboxID: event.sandboxID }) };
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
