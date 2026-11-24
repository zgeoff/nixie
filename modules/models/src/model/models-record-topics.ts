import type { LiveTopic } from '@heynixie/log';
import type { ModelsRecordKind } from './models-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const modelsRecordTopics = {
  'model.reply': [],
  'model.reply_voided': [],
  'model.turn_ended': [],
  'model.compacted': [],
  'model.compaction_failed': [],
  'model.session_opened': [],
  'model.session_rebuilt': [],
  'model.session_invalidated': [],
  'model.session_summarized': [],
  'model.session_cleanup_completed': [],
} as const satisfies Record<ModelsRecordKind, readonly LiveTopic[]>;
