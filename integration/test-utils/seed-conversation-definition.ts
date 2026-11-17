import type { Trigger } from '@heynixie/contract';
import { definitionChangedCodec } from '@heynixie/definitions';
import type { Log, Writer } from '@heynixie/log';
import { parseJSONObject, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { toCanonicalJSON, writeTriggerArming } from '@heynixie/triggers';
import { sql } from 'kysely';

export interface SeedContext {
  readonly log: Log;
  readonly writer: Writer;
}

export interface ConversationDefinition {
  readonly definitionID: string;
  readonly hash: string;
  readonly name: string;
  readonly note: string;
  readonly trigger: Trigger;

  // the runtime change that put it in force, or null when the repo did
  readonly changeID: string | null;
}

// Puts a definition in the state of the release before reminders: a version with target:
// conversation, an armed trigger, and for a runtime definition the record of its change.
export async function seedConversationDefinition(
  context: SeedContext,
  definition: ConversationDefinition,
): Promise<void> {
  const form = {
    name: definition.name,
    brief: definition.note,
    target: 'conversation',
    enabled: true,
    trigger: definition.trigger,
  };

  await withWriteTransaction(context.writer, async (tx) => {
    await sql`insert into task_definition_versions (definition_hash, definition_id, form, files)
      values (${definition.hash}, ${definition.definitionID}, ${toCanonicalJSON(form)}, '{}')`.execute(
      tx,
    );

    await writeTriggerArming(
      tx,
      { log: context.log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
      {
        armed: [
          {
            definitionID: definition.definitionID,
            definitionHash: definition.hash,
            source: 'schedule',
            target: 'conversation',
            trigger: definition.trigger,
          },
        ],
        withdrawn: [],
      },
    );

    if (definition.changeID !== null) {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'definition.changed',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          payload: definitionChangedCodec.encode({
            changeID: definition.changeID,
            shortID: `s${definition.changeID}`,
            definitionID: definition.definitionID,
            operation: 'add',
            hash: definition.hash,
            previous: null,
            caller: 'conversation',
            undoes: null,
            replaces: null,
            base: null,
            definitions: null,
          }),
          erasable: {
            version: {
              definitionID: definition.definitionID,
              hash: definition.hash,
              form: parseJSONObject(JSON.stringify(form)),
              files: {},
            },
          },
        },
      ]);
    }
  });
}
