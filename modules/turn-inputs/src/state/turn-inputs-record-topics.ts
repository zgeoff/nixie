import type { LiveTopic } from '@heynixie/log';
import type { TurnInputsRecordKind } from './turn-inputs-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const turnInputsRecordTopics = {
  'model.input_log_set': [],
  'model.input_opened': [],
} as const satisfies Record<TurnInputsRecordKind, readonly LiveTopic[]>;
