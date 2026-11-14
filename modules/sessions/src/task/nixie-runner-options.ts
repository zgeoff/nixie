import type { CompactionSettings } from '@heynixie/compaction';
import type { Logger } from '@heynixie/logger';
import type { TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import type { ConversationMemory, ConversationMemorySettings, SessionDefinitions } from '../types';
import type { SystemTaskOptions } from './make-system-task-runner';

export interface NixieRunnerOptions extends SystemTaskOptions {
  readonly context: TasksContext;

  readonly tools: Pick<ToolEndpoint, 'startRun'>;

  readonly getDefinitions: () => SessionDefinitions;

  readonly memory: () => ConversationMemory;
  readonly memorySettings: ConversationMemorySettings;
  readonly compaction: CompactionSettings;
  readonly defaultZone: string;
  readonly messaging: TaskMessaging;

  // empties the web fetch pause of every host when a forget cleans a task's session
  readonly clearFetchPauses: () => void;
  readonly log: Logger;
}
