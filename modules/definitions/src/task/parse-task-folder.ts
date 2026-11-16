import type { JSONObject } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import { checkPromptOverride } from '@heynixie/prompts';
import { sandboxStartSchema, startedTaskDefaultTools } from '@heynixie/tasks';
import { checkCallCaps, toSDKToolName } from '@heynixie/tools';
import { z } from 'zod';
import { normalizeInstructions } from '../definition/normalize-instructions';
import { buildSHA256 } from '../utils/build-sha256';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import { collectNestedUnknownFields } from './collect-nested-unknown-fields';
import { definitionOnlyKeys, definitionOnlySchema, maxCallsSchema } from './definition-only-schema';
import { formatIssue } from './format-issue';
import { parseTrigger } from './parse-trigger';
import type {
  SeedFault,
  TaskDefinition,
  TaskDefinitionWarning,
  TaskFolder,
  TaskSeedContext,
} from './types';

const idPattern = /^[a-z0-9-]{1,64}$/u;

export interface FolderOutcome {
  readonly faults: readonly SeedFault[];
  readonly warnings: readonly TaskDefinitionWarning[];
  readonly definition: TaskDefinition | null;
}

// The order is the folder's faults, then the YAML, then the unknown fields that skip the definition,
// then every other fault, so a skipped definition is never refused for a fault in its known keys.
export function parseTaskFolder(folder: TaskFolder, context: TaskSeedContext): FolderOutcome {
  const root = `tasks/${folder.id}`;
  const yaml = folder.files.get('task.yaml');

  const folderFaults: SeedFault[] = [
    ...(idPattern.test(folder.id)
      ? []
      : [{ path: `${root}/`, fault: 'bad_id' as const, reasons: [] }]),
    ...(yaml === undefined
      ? [{ path: `${root}/`, fault: 'missing_task_yaml' as const, reasons: [] }]
      : []),
  ];

  if (yaml === undefined || folderFaults.length > 0) {
    return { faults: folderFaults, warnings: [], definition: null };
  }

  const yamlPath = `${root}/task.yaml`;
  const mapping = parseMapping(yaml);

  if (typeof mapping === 'string') {
    return {
      faults: [{ path: yamlPath, fault: 'bad_definition', reasons: [mapping] }],
      warnings: [],
      definition: null,
    };
  }

  const rest = Object.fromEntries(
    Object.entries(mapping).filter(
      ([key]) => key !== 'runner' && !definitionOnlyKeys.some((only) => only === key),
    ),
  );

  const start = sandboxStartSchema.safeParse(rest);

  const unknown = [
    ...('runner' in mapping ? ['runner'] : []),
    ...(start.success
      ? []
      : start.error.issues.flatMap((issue) =>
          issue.code === 'unrecognized_keys' ? issue.keys : [],
        )),
    ...collectNestedUnknownFields(mapping),
  ];

  if (unknown.length > 0) {
    return {
      faults: [],
      warnings: unknown.map((field) => ({
        kind: 'field_unknown',
        definition: folder.id,
        field,
      })),
      definition: null,
    };
  }

  const faults: SeedFault[] = [];

  if (!start.success) {
    faults.push({
      path: yamlPath,
      fault: 'start_refused',
      reasons: start.error.issues.map((issue) => formatIssue(issue)),
    });
  }

  const only = definitionOnlySchema.safeParse(mapping);

  if (!only.success) {
    faults.push({
      path: yamlPath,
      fault: 'bad_definition',
      reasons: only.error.issues.map((issue) => formatIssue(issue)),
    });
  }

  const trigger = parseTrigger(mapping['trigger']);

  if (trigger.status === 'refused') {
    faults.push({ path: yamlPath, fault: trigger.fault, reasons: trigger.reasons });
  }

  const maxCalls = maxCallsSchema.safeParse(mapping['maxCalls']);

  if (!maxCalls.success) {
    faults.push({
      path: yamlPath,
      fault: 'bad_max_calls',
      reasons: maxCalls.error.issues.map((issue) => formatIssue(issue)),
    });
  }

  if (only.success) {
    faults.push(
      ...collectReminderFaults(yamlPath, mapping, only.data.target, trigger),
      ...collectStepFaults(root, folder, only.data.step),
    );
  }

  const instructions = folder.files.get('instructions.md');

  if (instructions !== undefined && !isSlotsAccepted(instructions)) {
    faults.push({ path: `${root}/instructions.md`, fault: 'bad_slot', reasons: [] });
  }

  if (!start.success || !only.success || !maxCalls.success || trigger.status === 'refused') {
    return { faults, warnings: [], definition: null };
  }

  const dropped = dropUnknownTools(folder.id, start.data.tools, context.toolNames);
  const input = { ...start.data, ...(dropped.tools === null ? {} : { tools: dropped.tools }) };
  const checked = context.checkTaskStart(input, 'file');

  if (checked.status === 'refused') {
    faults.push({ path: yamlPath, fault: 'start_refused', reasons: checked.reasons });
  }

  const capReasons = checkCallCaps(
    maxCalls.data,
    (dropped.tools ?? startedTaskDefaultTools).map((tool) => toHeldName(tool, context.toolNames)),
  );

  if (capReasons.length > 0) {
    faults.push({ path: yamlPath, fault: 'bad_max_calls', reasons: capReasons });
  }

  if (faults.length > 0) {
    return { faults, warnings: dropped.warnings, definition: null };
  }

  const form = parseJSONObject(
    JSON.stringify({ ...input, ...only.data, trigger: trigger.trigger, maxCalls: maxCalls.data }),
  );

  return {
    faults: [],
    warnings: dropped.warnings,
    definition: buildTaskDefinition(folder, form, only.data.step?.file ?? null),
  };
}

const recordSchema = z.record(z.string(), z.unknown());

// A string is the sentence of the fault.
function parseMapping(text: string): Record<string, unknown> | string {
  let value: unknown;

  try {
    value = Bun.YAML.parse(text);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const mapping = recordSchema.safeParse(value);

  return mapping.success ? mapping.data : 'task.yaml must hold a mapping of keys to values';
}

const reminderKeys = new Set(['name', 'brief', 'target', 'trigger', 'enabled']);

function collectReminderFaults(
  path: string,
  mapping: Readonly<Record<string, unknown>>,
  target: 'task' | 'conversation',
  trigger: ReturnType<typeof parseTrigger>,
): SeedFault[] {
  if (target !== 'conversation') {
    return [];
  }

  return [
    ...(Object.keys(mapping).some((key) => !reminderKeys.has(key))
      ? [{ path, fault: 'reminder_key' as const, reasons: [] }]
      : []),
    ...(trigger.status === 'parsed' && trigger.trigger === null
      ? [{ path, fault: 'reminder_without_trigger' as const, reasons: [] }]
      : []),
  ];
}

function collectStepFaults(
  root: string,
  folder: TaskFolder,
  step: { readonly file: string } | null,
): SeedFault[] {
  const stepFile = step?.file ?? null;

  const missing =
    stepFile !== null && !folder.files.has(stepFile)
      ? [
          {
            path: `${root}/task.yaml`,
            fault: 'bad_definition' as const,
            reasons: [`step.file names ${stepFile}, which the folder lacks`],
          },
        ]
      : [];

  const unnamed = [...folder.files.keys()]
    .filter((name) => name.endsWith('.ts') && name !== stepFile)
    .map((name) => ({
      path: `${root}/${name}`,
      fault: 'unnamed_step_file' as const,
      reasons: [],
    }));

  return [...missing, ...unnamed];
}

function isSlotsAccepted(text: string): boolean {
  return (
    checkPromptOverride('task', {
      parts: { instructions: normalizeInstructions(text) },
      template: null,
    }).length === 0
  );
}

function dropUnknownTools(
  definition: string,
  tools: readonly string[] | undefined,
  toolNames: readonly string[],
): { tools: string[] | null; warnings: TaskDefinitionWarning[] } {
  if (tools === undefined) {
    return { tools: null, warnings: [] };
  }

  const kept = tools.filter((tool) =>
    toolNames.some((name) => name === tool || toSDKToolName(name) === tool),
  );

  return {
    tools: kept,
    warnings: tools
      .filter((tool) => !kept.includes(tool))
      .map((tool) => ({ kind: 'tool_dropped', definition, tool })),
  };
}

// The model sees a tool by its SDK name, so a definition may list either name.
function toHeldName(tool: string, toolNames: readonly string[]): string {
  return toolNames.find((name) => name === tool || toSDKToolName(name) === tool) ?? tool;
}

function buildTaskDefinition(
  folder: TaskFolder,
  form: JSONObject,
  stepFile: string | null,
): TaskDefinition {
  const root = `tasks/${folder.id}`;
  const yaml = folder.files.get('task.yaml');
  const instructions = folder.files.get('instructions.md');
  const step = stepFile === null ? undefined : folder.files.get(stepFile);
  const files: Record<string, string> = {};

  if (yaml !== undefined) {
    files[`${root}/task.yaml`] = yaml;
  }

  if (instructions !== undefined) {
    files[`${root}/instructions.md`] = instructions;
  }

  if (stepFile !== null && step !== undefined) {
    files[`${root}/${stepFile}`] = step;
  }

  const parts = {
    id: folder.id,
    form,
    instructions:
      instructions === undefined ? null : buildSHA256(normalizeInstructions(instructions)),
    step: step === undefined ? null : buildSHA256(step),
  };

  const hash = buildSHA256(toCanonicalJSON(parts));

  return { id: folder.id, hash, form, files };
}
