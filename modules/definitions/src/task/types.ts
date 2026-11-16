import type { JSONObject } from '@heynixie/log';
import type { SandboxStartInput } from '@heynixie/tasks';

export type SeedFaultCode =
  | 'missing_task_yaml'
  | 'bad_id'
  | 'unnamed_step_file'
  | 'reminder_key'
  | 'reminder_without_trigger'
  | 'bad_slot'
  | 'bad_schedule'
  | 'at_without_offset'
  | 'start_refused'
  | 'bad_max_calls'
  | 'bad_definition';

export interface SeedFault {
  readonly path: string;
  readonly fault: SeedFaultCode;

  // the sentences of the schema or of the check; empty when the code says it all
  readonly reasons: readonly string[];
}

export type TaskDefinitionWarning =
  | {
      readonly kind: 'field_unknown';
      readonly definition: string;
      readonly field: string;
    }
  | {
      readonly kind: 'tool_dropped';
      readonly definition: string;
      readonly tool: string;
    };

export type CheckTaskStart = (
  input: SandboxStartInput,
  starter: 'file' | 'conversation',
) => { readonly status: 'planned' } | { readonly status: 'refused'; readonly reasons: string[] };

export interface TaskSeedContext {
  readonly checkTaskStart: CheckTaskStart;

  // the name of each registered tool
  readonly toolNames: readonly string[];
}

export interface TaskDefinition {
  readonly id: string;
  readonly hash: string;

  // the parsed task.yaml with the defaults filled
  readonly form: JSONObject;

  // each file's path to its exact text
  readonly files: Readonly<Record<string, string>>;
}

export interface TaskDefinitions {
  readonly definitions: readonly TaskDefinition[];
  readonly warnings: readonly TaskDefinitionWarning[];
  readonly faults: readonly SeedFault[];

  // the files that a definition applies
  readonly paths: ReadonlySet<string>;
}

export interface TaskFolder {
  readonly id: string;

  // the files directly in the folder, by name
  readonly files: ReadonlyMap<string, string>;
}
