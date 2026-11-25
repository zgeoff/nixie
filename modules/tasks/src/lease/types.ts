import type { RelatedMemoryLookup } from '@heynixie/tools';
import type { TaskMessaging, TasksContext } from '../types';

export type StartToolContext = Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'runners'>;

export type StartMessaging = Pick<TaskMessaging, 'hopLimit' | 'ownerName'>;

// The tool of one runner's start, other than the default runner's.
export interface RunnerStartSpec {
  // the tool's name, which the policy rules match, such as `coding.start`
  readonly name: string;
  readonly description: string;

  // the key of the runner that the tool starts; it names a runner of the registry with a start
  readonly runner: string;

  // what the tool looks up in memory after it applies, for a starter that reads memory
  readonly relatedMemory?: RelatedMemoryLookup | undefined;
}
