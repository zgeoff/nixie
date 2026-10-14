import { buildModelStatus } from './build-model-status';
import { buildStartStatus } from './build-start-status';
import { buildStartTimeStatus } from './build-start-time-status';
import type { StatusRegistry } from './build-status-registry';
import { buildStatusRegistry } from './build-status-registry';

// The status of a conversation whose server adds no entry: the kind of start, the start time and
// the model.
export function buildDefaultStatus(): StatusRegistry {
  return buildStatusRegistry([buildStartStatus(), buildStartTimeStatus(), buildModelStatus()]);
}
