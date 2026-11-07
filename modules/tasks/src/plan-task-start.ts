import { toSDKToolName } from '@heynixie/tools';
import type { HarnessCapability } from '@heynixie/wire';
import { startedTaskBaseTools, startedTaskDefaultTools } from './started-task-default-tools';
import type {
  TaskLimits,
  TaskMemory,
  TaskPersona,
  TaskReport,
  TaskRunOptions,
  TaskStartBounds,
} from './types';

export interface TaskStartChoice {
  readonly model?: string | undefined;
  readonly persona?: TaskPersona | undefined;
  readonly memory?: TaskMemory | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly report?: TaskReport | undefined;
  readonly limits?:
    | { readonly turns?: number | undefined; readonly dollars?: number | undefined }
    | undefined;
}

type ToolRefusalReason =
  | 'wider_tools'
  | 'conversation_tools'
  | 'memory_tools'
  | 'memory_write_tools';

interface ToolRefusal {
  readonly reason: ToolRefusalReason;
  readonly tools: readonly string[];
  readonly accepted: readonly string[];
}

export type TaskStartChoiceRefusal =
  | { readonly reason: 'unknown_model'; readonly model: string }
  | {
      readonly reason: 'harness_misfit';
      readonly model: string;
      readonly missing: readonly HarnessCapability[];
    }
  | { readonly reason: 'stranger_with_memory' }
  | { readonly reason: 'wider_memory' }
  | { readonly reason: 'wider_persona' }
  | { readonly reason: 'over_limit'; readonly limit: keyof TaskLimits; readonly max: number }
  | ToolRefusal;

export type TaskStartPlan =
  | { readonly status: 'planned'; readonly options: TaskRunOptions }
  | { readonly status: 'refused'; readonly refusal: TaskStartChoiceRefusal };

export interface TaskStarter {
  readonly tools: readonly string[];
  readonly memory: TaskMemory;
  readonly persona: TaskPersona;
}

export function planTaskStart(
  choice: TaskStartChoice,
  starter: TaskStarter,
  bounds: TaskStartBounds,
): TaskStartPlan {
  const starterTools = starter.tools;

  const model =
    choice.model === undefined
      ? null
      : (bounds.models.find((entry) => entry.name === choice.model) ?? null);

  if (choice.model !== undefined && model === null) {
    return refuse({ reason: 'unknown_model', model: choice.model });
  }

  if (model !== null && model.missing.length > 0) {
    return refuse({ reason: 'harness_misfit', model: model.name, missing: model.missing });
  }

  // A task gets the persona only when its starter has it, so a stranger's tasks are strangers too.
  const persona = choice.persona ?? starter.persona;
  const memory = choice.memory ?? 'none';

  if (persona === 'default' && starter.persona === 'none') {
    return refuse({ reason: 'wider_persona' });
  }

  // The starter rule that asks before this combination needs a decision point that can ask, so
  // until then code refuses it.
  if (persona === 'none' && memory === 'read') {
    return refuse({ reason: 'stranger_with_memory' });
  }

  // Memory reaches a task's turn through its options and no tool, so the tool check misses it.
  if (memory === 'read' && starter.memory === 'none') {
    return refuse({ reason: 'wider_memory' });
  }

  const limits = {
    turns: choice.limits?.turns ?? bounds.limits.default.turns,
    dollars: choice.limits?.dollars ?? bounds.limits.default.dollars,
  };

  const over = (['turns', 'dollars'] as const).find((key) => limits[key] > bounds.limits.max[key]);

  if (over !== undefined) {
    return refuse({ reason: 'over_limit', limit: over, max: bounds.limits.max[over] });
  }

  const asked =
    choice.tools?.map((name) => findHeldToolName(name, starterTools) ?? name) ??
    startedTaskDefaultTools.filter((tool) => starterTools.includes(tool));

  const memoryTools = memory === 'read' ? bounds.memoryTools.read : [];

  const accepted = starterTools.filter(
    (tool) =>
      !bounds.conversationTools.includes(tool) &&
      !bounds.memoryTools.write.includes(tool) &&
      (memoryTools.includes(tool) || !bounds.memoryTools.read.includes(tool)),
  );

  const refused = pickToolRefusal(asked, starterTools, bounds, memoryTools);

  if (refused !== null) {
    return refuse({ ...refused, accepted });
  }

  const tools = [
    ...startedTaskBaseTools,
    ...asked,
    ...memoryTools.filter((tool) => starterTools.includes(tool)),
  ];

  return {
    status: 'planned',
    options: {
      model: model?.name ?? null,
      profile: model?.profile ?? null,
      persona,
      memory,
      tools: [...new Set(tools)].filter((tool) => starterTools.includes(tool)),
      report: choice.report ?? 'wake',
      limits,
    },
  };
}

function refuse(refusal: TaskStartChoiceRefusal): TaskStartPlan {
  return { status: 'refused', refusal };
}

// The model sees each tool by its SDK name, so a task accepts that name as well as nixie's own.
function findHeldToolName(name: string, starterTools: readonly string[]): string | null {
  if (starterTools.includes(name)) {
    return name;
  }

  return starterTools.find((tool) => toSDKToolName(tool) === name) ?? null;
}

function pickToolRefusal(
  asked: readonly string[],
  starterTools: readonly string[],
  bounds: TaskStartBounds,
  memoryTools: readonly string[],
): Omit<ToolRefusal, 'accepted'> | null {
  const checks: readonly [ToolRefusalReason, (tool: string) => boolean][] = [
    ['wider_tools', (tool) => !starterTools.includes(tool)],
    ['conversation_tools', (tool) => bounds.conversationTools.includes(tool)],
    ['memory_write_tools', (tool) => bounds.memoryTools.write.includes(tool)],
    [
      'memory_tools',
      (tool) => bounds.memoryTools.read.includes(tool) && !memoryTools.includes(tool),
    ],
  ];

  for (const [reason, isRefused] of checks) {
    const tools = asked.filter((tool) => isRefused(tool));

    if (tools.length > 0) {
      return { reason, tools };
    }
  }

  return null;
}
