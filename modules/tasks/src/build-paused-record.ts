import type { Definitions, RecordInput } from '@heynixie/log';
import { taskPausedCodec } from './task-paused-codec';
import type { ResumeState } from './types';

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
