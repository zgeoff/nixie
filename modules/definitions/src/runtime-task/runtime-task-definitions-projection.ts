import type { Projection } from '@heynixie/log';
import { match } from 'ts-pattern';
import type { DefinitionsTables } from '../types';
import { definitionChangedCodec } from './definition-changed-codec';
import { definitionConflictResolvedCodec } from './definition-conflict-resolved-codec';
import { definitionRepoMovedCodec } from './definition-repo-moved-codec';
import { definitionSettledCodec } from './definition-settled-codec';
import { writeRuntimeTaskState } from './write-runtime-task-state';

// One row per runtime change of a task definition. The body of a version sits in
// task_definition_versions, which the writer of the change fills, because a fold reads no erasable
// field. writeTaskVersionRestore fills it again from the records after a rebuild.
export const runtimeTaskDefinitionsProjection: Projection = {
  table: 'runtime_task_definitions',
  keyColumn: 'change_id',
  fold: (tx, record) => {
    const tables = tx.$extendTables<DefinitionsTables>();

    return match(record.kind)
      .with(definitionChangedCodec.kind, async () => {
        const changed = definitionChangedCodec.decode(record.payload);

        const inForce = await tables
          .selectFrom('runtime_task_definitions')
          .select('change_id')
          .where('definition_id', '=', changed.definitionID)
          .where('state', '=', 'in_force')
          .executeTakeFirst();

        if (inForce !== undefined) {
          await writeRuntimeTaskState(tx, {
            changeID: inForce.change_id,
            to: 'superseded',
            cause: 'later_change',
            sequence: record.sequence,
          });
        }

        await tables
          .insertInto('runtime_task_definitions')
          .values({
            change_id: changed.changeID,
            short_id: changed.shortID,
            definition_id: changed.definitionID,
            operation: changed.operation,
            definition_hash: changed.hash,
            previous_hash: changed.previous,
            base_hash: changed.base,
            definitions_hash: changed.definitions,
            replaces: changed.replaces,
            undoes: changed.undoes,
            caller: changed.caller,
            state: 'in_force',
            state_cause: null,
            changed_sequence: record.sequence,
            updated_sequence: record.sequence,
          })
          .execute();

        return inForce === undefined ? [changed.changeID] : [inForce.change_id, changed.changeID];
      })
      .with(definitionSettledCodec.kind, async () => {
        const settled = definitionSettledCodec.decode(record.payload);

        await writeRuntimeTaskState(tx, {
          changeID: settled.changeID,
          to: settled.outcome,
          cause: settled.cause,
          sequence: record.sequence,
        });

        return [settled.changeID];
      })
      .with(definitionRepoMovedCodec.kind, async () => {
        const moved = definitionRepoMovedCodec.decode(record.payload);

        await tables
          .updateTable('runtime_task_definitions')
          .set({ definitions_hash: moved.definitions, updated_sequence: record.sequence })
          .where('change_id', '=', moved.changeID)
          .execute();

        return [moved.changeID];
      })
      .with(definitionConflictResolvedCodec.kind, async () => {
        const resolved = definitionConflictResolvedCodec.decode(record.payload);

        if (resolved.keep === 'repo') {
          await writeRuntimeTaskState(tx, {
            changeID: resolved.changeID,
            to: 'retired',
            cause: 'kept_repo',
            sequence: record.sequence,
          });
        } else {
          await tables
            .updateTable('runtime_task_definitions')
            .set({
              base_hash: resolved.definitions,
              definitions_hash: resolved.definitions,
              updated_sequence: record.sequence,
            })
            .where('change_id', '=', resolved.changeID)
            .execute();
        }

        return [resolved.changeID];
      })
      .otherwise(() => Promise.resolve([]));
  },
};
