import { conversationTaskID } from '@heynixie/tasks';
import type { WakeTarget } from '../types';

// The task whose thread a wake of the target lands on.
export function buildTargetTaskID(target: WakeTarget): string {
  return target.kind === 'task' ? target.taskID : conversationTaskID;
}
