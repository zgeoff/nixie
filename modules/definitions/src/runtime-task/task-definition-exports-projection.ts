import type { Projection } from '@heynixie/log';
import { match } from 'ts-pattern';
import type { DefinitionsTables } from '../types';
import { definitionExportMovedCodec } from './definition-export-moved-codec';

// One row per export of task definitions, in the shape of the rule exports.
export const taskDefinitionExportsProjection: Projection = {
  table: 'task_definition_exports',
  keyColumn: 'export_id',
  fold: async (tx, record) => {
    if (record.kind !== definitionExportMovedCodec.kind) {
      return [];
    }

    const moved = definitionExportMovedCodec.decode(record.payload);

    const values = match(moved.to)
      .with('exporting', () => ({ attempt_started_sequence: record.sequence }))
      .with('opened', () => ({
        state: 'opened' as const,
        attempt_started_sequence: null,
        ...(moved.pullRequest === null
          ? {}
          : {
              pull_request_number: moved.pullRequest.number,
              pull_request_url: moved.pullRequest.url,
            }),
      }))
      .with('closed', () => ({
        state: 'closed' as const,
        attempt_started_sequence: null,
        ...(moved.pullRequest === null
          ? {}
          : {
              pull_request_number: moved.pullRequest.number,
              pull_request_url: moved.pullRequest.url,
            }),
      }))
      .exhaustive();

    await tx
      .$extendTables<DefinitionsTables>()
      .insertInto('task_definition_exports')
      .values({
        export_id: moved.exportID,
        branch: moved.branch,
        ...values,
        updated_sequence: record.sequence,
      })
      .onConflict((conflict) =>
        conflict
          .column('export_id')
          .doUpdateSet({ branch: moved.branch, ...values, updated_sequence: record.sequence }),
      )
      .execute();

    return [moved.exportID];
  },
};
