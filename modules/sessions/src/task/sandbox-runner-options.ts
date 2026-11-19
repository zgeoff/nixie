import type { CompactionSettings } from '@heynixie/compaction';
import type { Logger } from '@heynixie/logger';
import type { SpendContext } from '@heynixie/spend';
import type { TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  InStepActions,
  SessionDefinitions,
} from '../types';
import type { SystemTaskOptions } from './make-system-task-runner';

export interface SandboxRunnerOptions extends SystemTaskOptions {
  readonly context: TasksContext;

  readonly tools: Pick<ToolEndpoint, 'startRun'>;

  readonly getDefinitions: () => SessionDefinitions;

  readonly memory: () => ConversationMemory;
  readonly memorySettings: ConversationMemorySettings;

  // the memory tools that only read, which task.start gives a task with memory read, so the task
  // run of a definition with memory read gets them too
  readonly memoryReadTools: readonly string[];
  readonly compaction: CompactionSettings;
  readonly defaultZone: string;
  readonly messaging: TaskMessaging;

  // empties the web fetch pause of every host when a forget cleans a task's session
  readonly clearFetchPauses: () => void;

  // runs the approved calls of the tools that run inside the turn, before a task's turn
  readonly inStepActions?: InStepActions;

  // set with spendStop: each step checks the turn count and the stop before its turn
  readonly spend?: SpendContext;
  readonly log: Logger;
}
