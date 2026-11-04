import { startedTaskBaseTools, startedTaskDefaultTools } from './started-task-tools';
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

export type TaskStartChoiceRefusal =
  | { readonly reason: 'unknown_model'; readonly model: string }
  | { readonly reason: 'stranger_with_memory' }
  | { readonly reason: 'over_limit'; readonly limit: keyof TaskLimits; readonly max: number }
  | { readonly reason: 'wider_tools'; readonly tools: readonly string[] }
  | { readonly reason: 'memory_tools'; readonly tools: readonly string[] }
  | { readonly reason: 'conversation_tools'; readonly tools: readonly string[] };

export type TaskStartPlan =
  | { readonly status: 'planned'; readonly options: TaskRunOptions }
  | { readonly status: 'refused'; readonly refusal: TaskStartChoiceRefusal };

export function planTaskStart(
  choice: TaskStartChoice,
  starterTools: readonly string[],
  bounds: TaskStartBounds,
): TaskStartPlan {
  const model =
    choice.model === undefined
      ? null
      : (bounds.models.find((entry) => entry.name === choice.model) ?? null);

  if (choice.model !== undefined && model === null) {
    return refuse({ reason: 'unknown_model', model: choice.model });
  }

  const persona = choice.persona ?? 'default';
  const memory = choice.memory ?? 'none';

  // The starter rule that asks before this combination needs a decision point that can ask, so
  // until then code refuses it.
  if (persona === 'none' && memory === 'read') {
    return refuse({ reason: 'stranger_with_memory' });
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
    choice.tools ?? startedTaskDefaultTools.filter((tool) => starterTools.includes(tool));

  const wider = asked.filter((tool) => !starterTools.includes(tool));

  if (wider.length > 0) {
    return refuse({ reason: 'wider_tools', tools: wider });
  }

  const conversationOnly = asked.filter((tool) => bounds.conversationTools.includes(tool));

  if (conversationOnly.length > 0) {
    return refuse({ reason: 'conversation_tools', tools: conversationOnly });
  }

  const memoryTools = memory === 'read' ? bounds.memoryTools.read : [];

  const leftOut = asked.filter(
    (tool) =>
      !memoryTools.includes(tool) &&
      [...bounds.memoryTools.read, ...bounds.memoryTools.write].includes(tool),
  );

  if (leftOut.length > 0) {
    return refuse({ reason: 'memory_tools', tools: leftOut });
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
