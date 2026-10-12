import type { StepActivity } from './build-activity';

// Formats the one line a collapsed step shows: each tool the step called with the targets it
// called it on, such as "web fetch: theverge.com, arstechnica.com". A step that called no tool
// names its task, and a step that has not ended says how it stands.
export function formatStepSummary(step: StepActivity): string {
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
  const line = tools.length === 0 ? `${step.taskID ?? 'task'}: no tools` : tools.join('; ');

  return step.status === 'done' ? line : `${line} (${step.status})`;
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
