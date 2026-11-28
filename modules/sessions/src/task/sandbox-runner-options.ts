import type { CompactionSettings } from '@heynixie/compaction';
import type { Logger } from '@heynixie/logger';
import type { SpendContext } from '@heynixie/spend';
import type { StepInput, StepResult, TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  InStepActions,
  SessionDefinitions,
  SkillCatalogInput,
  SkillJoinInput,
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

  // the skills of a run whose definition lists some, or absent where no skills are loaded
  readonly skills?: RunSkills;

  // the calls module's side of a call's turns, or absent where calls are off
  readonly calls?: CallStepHooks;
}

export interface RunSkills {
  // puts each listed skill on the pin of the run's task, so a task that outlives a change to its
  // definition's list holds every skill the list names
  readonly join: (input: SkillJoinInput) => Promise<void>;

  // the catalog of the listed skills in the pin, or null when the list holds none
  readonly readCatalog: (input: SkillCatalogInput) => Promise<string | null>;
}

export interface CallStepHooks {
  // the call's prompt, which follows the conversation's prompt in a call's session
  readonly prompt: string;

  // the conversation's tool names, from which a call's tool list is built
  readonly conversationToolNames: readonly string[];

  // the tools that only a call's session holds
  readonly addedToolNames: readonly string[];

  // Runs one step of a call's thread around the model turn, answers the speech layer when the turn
  // ends and ends the call when the turn asked to hang up.
  readonly runStep: (step: CallStep) => Promise<StepResult>;
}

export interface CallStep {
  readonly context: Pick<TasksContext, 'log'>;
  readonly input: StepInput;

  // runs the model turn of the call's step
  readonly runTurn: () => Promise<StepResult>;
}
