import type { LiveTopic } from '@heynixie/log';
import type { WorkerRecordKind } from './worker-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const workerRecordTopics = {
  'worker.run_started': ['tasks'],
  'worker.turn_ended': ['tasks'],
  'worker.gateway_charged': ['tasks'],
  'worker.run_ended': ['tasks'],
} as const satisfies Record<WorkerRecordKind, readonly LiveTopic[]>;
