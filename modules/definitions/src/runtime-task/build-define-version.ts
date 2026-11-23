import type { Trigger } from '@heynixie/contract';
import { parseTaskFolder } from '../task/parse-task-folder';
import type {
  CheckTaskStart,
  SeedFault,
  TaskDefinition,
  TaskDefinitionWarning,
} from '../task/types';
import { renderTaskYAML } from './render-task-yaml';
import type { StoredTaskDefinition } from './stored-task-definition';

export interface TaskDefineInput {
  // names a definition to replace; without it, the ID is the slug of `name`
  readonly definitionID?: string | undefined;
  readonly name: string;
  readonly brief: string;
  readonly trigger: Trigger;
  readonly model?: string | undefined;
  readonly persona?: 'default' | 'none' | undefined;
  readonly memory?: 'none' | 'read' | 'self_notes' | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly report?: 'wake' | 'next_turn' | 'none' | undefined;
}

export interface DefineVersionContext {
  readonly checkTaskStart: CheckTaskStart;
  readonly toolNames: readonly string[];
}

export type DefineVersion =
  | {
      readonly status: 'built';
      readonly definition: StoredTaskDefinition;

      // the time of an `at` trigger, epoch milliseconds
      readonly oneShotAt: number | null;
    }
  | { readonly status: 'invalid'; readonly reasons: readonly string[] };

// Builds the whole version from the input, the way the seed builds one from a task.yaml: the same
// schema, defaults and hash, checked for the starter `conversation`. The input is the whole
// version, so an optional key it omits takes its default.
export function buildDefineVersion(
  input: TaskDefineInput,
  context: DefineVersionContext,
): DefineVersion {
  const definitionID = input.definitionID ?? buildDefinitionSlug(input.name);

  if (definitionID === null) {
    return { status: 'invalid', reasons: ['the name holds no letter or digit for an ID'] };
  }

  const yaml = renderTaskYAML(buildTaskMapping(input));

  const outcome = parseTaskFolder(
    { id: definitionID, files: new Map([['task.yaml', yaml]]) },
    {
      toolNames: context.toolNames,
      checkTaskStart: (start) => context.checkTaskStart(start, 'conversation'),
    },
  );

  const reasons = [
    ...outcome.faults.flatMap((fault) => formatFault(fault)),
    ...outcome.warnings.map((warning) => formatWarning(warning)),
  ];

  if (reasons.length > 0 || outcome.definition === null) {
    return {
      status: 'invalid',
      reasons: reasons.length > 0 ? reasons : ['the definition is not valid'],
    };
  }

  return {
    status: 'built',
    definition: toStoredDefinition(outcome.definition),
    oneShotAt: toOneShotAt(input.trigger),
  };
}

// The slug of a name: lowercase, each run of characters outside a-z and 0-9 one hyphen, hyphens
// trimmed from both ends, cut to 64 characters. An empty slug is null.
function buildDefinitionSlug(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 64);

  return slug === '' ? null : slug;
}

// The place for the checks that need more than the schema: the zone read of an `at` without an
// offset and the file-only keys of the definition in force.
function buildTaskMapping(input: TaskDefineInput): Record<string, unknown> {
  return {
    name: input.name,
    brief: input.brief,
    trigger: input.trigger,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.persona === undefined ? {} : { persona: input.persona }),
    ...(input.memory === undefined ? {} : { memory: input.memory }),
    ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
    ...(input.report === undefined ? {} : { report: input.report }),
  };
}

function formatFault(fault: SeedFault): readonly string[] {
  return fault.reasons.length === 0 ? [fault.fault] : fault.reasons;
}

function formatWarning(warning: TaskDefinitionWarning): string {
  return warning.kind === 'field_unknown'
    ? `the field ${warning.field} is unknown`
    : `the tool ${warning.tool} is unknown`;
}

function toStoredDefinition(definition: TaskDefinition): StoredTaskDefinition {
  return {
    definitionID: definition.id,
    hash: definition.hash,
    form: definition.form,
    files: { ...definition.files },
  };
}

function toOneShotAt(trigger: Trigger): number | null {
  return 'at' in trigger ? Date.parse(trigger.at) : null;
}
