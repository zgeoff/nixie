import { findHeldToolName, findToolPins } from '@heynixie/tools';
import type { HarnessCapability } from '@heynixie/wire';
import { checkReportShape } from '../../report/check-report-shape';
import { taskReportToolName } from '../../report/task-report-tool-name';
import type { ShapeFault } from '../../report/types';
import { pickReportMode } from '../../run/pick-report-mode';
import type {
  TaskLimits,
  TaskLog,
  TaskMemory,
  TaskPersona,
  TaskReport,
  TaskRunOptions,
  TaskStartBounds,
} from '../../types';
import { startedTaskBaseTools, startedTaskDefaultTools } from '../started-task-default-tools';

export interface TaskStartChoice {
  readonly model?: string | undefined;
  readonly persona?: TaskPersona | undefined;
  readonly memory?: TaskMemory | undefined;
  readonly log?: TaskLog | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly report?: TaskReport | undefined;
  readonly reportShape?: unknown;
  readonly limits?:
    | {
        readonly turns?: number | undefined;
        readonly dollars?: number | undefined;
      }
    | undefined;
}

type ToolRefusalReason = 'wider_tools' | 'conversation_tools' | 'memory_tools';

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
  | { readonly reason: 'self_notes_start' }
  | { readonly reason: 'wider_log' }
  | { readonly reason: 'wider_persona' }
  | {
      readonly reason: 'over_limit';
      readonly limit: keyof TaskLimits;
      readonly max: number;
    }
  | { readonly reason: 'report_shape'; readonly fault: ShapeFault }
  | ToolRefusal;

export type TaskStartPlan =
  | { readonly status: 'planned'; readonly options: TaskRunOptions }
  | { readonly status: 'refused'; readonly refusal: TaskStartChoiceRefusal };

export interface TaskStarter {
  readonly tools: readonly string[];
  readonly memory: TaskMemory;
  readonly persona: TaskPersona;
  readonly log: TaskLog;

  // the pins of the run that starts the task; the task keeps those of each tool it gets
  readonly connectionPins?: Readonly<Record<string, readonly string[]>> | undefined;
}

export function planTaskStart(
  choice: TaskStartChoice,
  starter: TaskStarter,
  bounds: TaskStartBounds,
): TaskStartPlan {
  const starterTools = starter.tools;

  if (choice.memory === 'self_notes') {
    return refuse({ reason: 'self_notes_start' });
  }

  const model =
    choice.model === undefined
      ? null
      : (bounds.models.find((entry) => entry.name === choice.model) ?? null);

  if (choice.model !== undefined && model === null) {
    return refuse({ reason: 'unknown_model', model: choice.model });
  }

  if (model !== null && model.missing.length > 0) {
    return refuse({
      reason: 'harness_misfit',
      model: model.name,
      missing: model.missing,
    });
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

  // Like memory, the log reaches a task through its options and no tool.
  const log = choice.log ?? 'own';

  if (log === 'conversation' && starter.log !== 'conversation') {
    return refuse({ reason: 'wider_log' });
  }

  const shape = choice.reportShape === undefined ? null : checkReportShape(choice.reportShape);

  if (shape?.status === 'refused') {
    return refuse({ reason: 'report_shape', fault: shape.fault });
  }

  const limits = {
    turns: choice.limits?.turns ?? bounds.limits.default.turns,
    dollars: choice.limits?.dollars ?? bounds.limits.default.dollars,
  };

  // A meter with no max takes any limit, and a meter with no limit passes.
  const [over] = (['turns', 'dollars'] as const).flatMap((key) => {
    const value = limits[key];
    const max = bounds.limits.max[key];

    return value !== null && max !== null && value > max ? [{ key, max }] : [];
  });

  if (over !== undefined) {
    return refuse({ reason: 'over_limit', limit: over.key, max: over.max });
  }

  const asked =
    choice.tools?.map((name) => findHeldToolName(name, starterTools) ?? name) ??
    startedTaskDefaultTools.filter((tool) => starterTools.includes(tool));

  // With memory read, a task may get each memory tool its starter holds; a write tool joins only
  // when the start names it, while the read tools join by default.
  const defaultMemoryTools = memory === 'read' ? bounds.memoryTools.read : [];

  const allowedMemoryTools =
    memory === 'read' ? [...bounds.memoryTools.read, ...bounds.memoryTools.write] : [];

  const allMemoryTools = new Set([...bounds.memoryTools.read, ...bounds.memoryTools.write]);

  const accepted = starterTools.filter(
    (tool) =>
      !bounds.conversationTools.includes(tool) &&
      (allowedMemoryTools.includes(tool) || !allMemoryTools.has(tool)),
  );

  const refused = pickToolRefusal(asked, starterTools, bounds, allowedMemoryTools);

  if (refused !== null) {
    return refuse({ ...refused, accepted });
  }

  const tools = [
    ...startedTaskBaseTools,
    ...asked,
    ...defaultMemoryTools.filter((tool) => starterTools.includes(tool)),
  ];

  const kept = [...new Set(tools)].filter(
    (tool) => tool === taskReportToolName || starterTools.includes(tool),
  );

  const connectionPins = pickStartedPins(starter.connectionPins, kept);

  return {
    status: 'planned',
    options: {
      model: model?.name ?? null,
      profile: model?.profile ?? null,
      persona,
      memory,
      log,
      tools: kept,
      report: pickReportMode(choice.report, 'start', bounds),
      limits,
      ...(shape === null ? {} : { reportShape: shape.shape }),
      ...(connectionPins === null ? {} : { connectionPins }),
    },
  };
}

function refuse(refusal: TaskStartChoiceRefusal): TaskStartPlan {
  return { status: 'refused', refusal };
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
    [
      'memory_tools',
      (tool) =>
        (bounds.memoryTools.read.includes(tool) || bounds.memoryTools.write.includes(tool)) &&
        !memoryTools.includes(tool),
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

// The pins of each tool the task gets, or null when its starter pins none of them.
function pickStartedPins(
  pins: TaskStarter['connectionPins'],
  tools: readonly string[],
): Readonly<Record<string, readonly string[]>> | null {
  const kept = tools.flatMap((tool) => {
    const found = findToolPins(pins, tool);

    return found === undefined ? [] : [[tool, found] as const];
  });

  return kept.length === 0 ? null : Object.fromEntries(kept);
}
