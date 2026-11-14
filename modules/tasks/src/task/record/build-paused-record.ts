import type { Definitions, RecordInput } from '@heynixie/log';
import type { ResumeState } from '../../types';
import { taskPausedCodec } from '../codec/task-paused-codec';

export function buildPausedRecord(
  taskID: string,
  resumeState: ResumeState,
  definitions: Definitions,
): RecordInput {
  return {
    kind: 'task.paused',
    definitions,
    thread: taskID,
    payload: taskPausedCodec.encode({ taskID, resumeState }),
  };
}
