import type { EnvelopeRecord, Projection } from '@heynixie/log';
import { triggerFiredCodec, triggerSkippedCodec, triggerTaskInputCodec } from '@heynixie/tasks';
import { triggerMailArrivedCodec } from '../record/trigger-mail-arrived-codec';
import type { TriggersTables } from '../types';
import { buildSourceKey } from '../utils/build-source-key';

// One row per fire, skip or event that names its task. A plain insert: a second write of one key fails its transaction.
export const triggerKeysProjection: Projection = {
  table: 'trigger_keys',
  keyColumn: 'source_key',
  fold: async (tx, record) => {
    const db = tx.$extendTables<TriggersTables>();

    if (
      record.kind !== 'trigger.fired' &&
      record.kind !== 'trigger.skipped' &&
      record.kind !== 'trigger.task_input' &&
      record.kind !== triggerMailArrivedCodec.kind
    ) {
      return [];
    }

    const fire = decodeFire(record);
    const sourceKey = buildSourceKey(fire.source, fire.dedupeKey);

    await db
      .insertInto('trigger_keys')
      .values({ source_key: sourceKey, sequence: record.sequence })
      .execute();

    return [sourceKey];
  },
};

function decodeFire(record: EnvelopeRecord): {
  readonly source: string;
  readonly dedupeKey: string;
} {
  if (record.kind === 'trigger.fired') {
    return triggerFiredCodec.decode(record.payload);
  }

  if (record.kind === 'trigger.skipped') {
    return triggerSkippedCodec.decode(record.payload);
  }

  return record.kind === triggerMailArrivedCodec.kind
    ? triggerMailArrivedCodec.decode(record.payload)
    : triggerTaskInputCodec.decode(record.payload);
}
