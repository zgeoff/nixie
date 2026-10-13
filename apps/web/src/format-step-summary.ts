import type { StepActivity } from './build-activity';

// Formats a collapsed step's one line: the task, how it stands unless done, how many memories its
// recalls delivered, each tool with its targets, such as "web fetch: theverge.com", and how long
// it ran. A part shows only once its data exists.
export function formatStepSummary(step: StepActivity): string {
  const parts = [
    step.taskID ?? 'task',
    ...formatStatus(step),
    ...(step.memories === undefined ? [] : [formatMemoryCount(step.memories.length)]),
    formatTools(step),
    ...(step.durationMs === undefined ? [] : [formatDuration(step.durationMs)]),
  ];

  return parts.join(' · ');
}

const errorLimit = 80;

function formatStatus(step: StepActivity): readonly string[] {
  if (step.status === 'done') {
    return [];
  }
  if (step.status !== 'failed' || step.error === undefined) {
    return [step.status];
  }
  const error = step.error.length > errorLimit ? `${step.error.slice(0, errorLimit)}…` : step.error;

  return [`failed: ${error}`];
}

function formatMemoryCount(count: number): string {
  return count === 1 ? '1 memory' : `${count} memories`;
}

function formatTools(step: StepActivity): string {
  const byTool = new Map<string, string[]>();

  for (const call of step.calls) {
    const targets = byTool.get(call.tool) ?? [];
    const target = formatTarget(call.input);
    const next = target === undefined ? targets : [...targets, target];

    byTool.set(call.tool, next);
  }

  const tools = [...byTool].map(([tool, targets]) =>
    targets.length === 0 ? formatToolName(tool) : `${formatToolName(tool)}: ${targets.join(', ')}`,
  );

  return tools.length === 0 ? 'no tools' : tools.join('; ');
}

// 12.3s under a minute, and 1m 5s from a minute on
function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000;

  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

// web_fetch reads as "web fetch"
function formatToolName(tool: string): string {
  return tool.replaceAll(/[_.]+/gu, ' ');
}

const targetLimit = 60;

// The input's first text value, and a URL's host name alone.
function formatTarget(input: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const text = Object.values(input ?? {}).find((value) => typeof value === 'string');

  if (typeof text !== 'string' || text === '') {
    return undefined;
  }

  const host = URL.parse(text)?.hostname;
  const target = host === undefined || host === '' ? text : host.replace(/^www\./u, '');

  return target.length > targetLimit ? `${target.slice(0, targetLimit)}…` : target;
}
