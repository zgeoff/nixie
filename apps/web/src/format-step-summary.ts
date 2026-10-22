import { z } from 'zod';
import type { RecalledMemory, StepActivity, ToolActivity } from './build-activity';
import { formatContext } from './format-context';

export function formatStepSummary(step: StepActivity): string {
  const parts = [
    step.taskID ?? 'task',
    ...formatStatus(step),
    ...(step.memories === undefined ? [] : [formatMemoryCount(step.memories)]),
    formatTools(step),
    ...(step.context === undefined ? [] : [formatContext(step.context)]),
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

function formatMemoryCount(memories: readonly RecalledMemory[]): string {
  const count = memories.length === 1 ? '1 memory' : `${memories.length} memories`;
  const noise = memories.filter((memory) => memory.rating?.verdict === 'noise').length;

  return noise === 0 ? count : `${count} (${noise} noise)`;
}

function formatTools(step: StepActivity): string {
  const byTool = new Map<string, string[]>();

  for (const call of step.calls) {
    const targets = byTool.get(call.tool) ?? [];
    const target = formatTarget(call);
    const next = target === undefined ? targets : [...targets, target];

    byTool.set(call.tool, next);
  }

  const tools = [...byTool].map(([tool, targets]) =>
    targets.length === 0 ? formatToolName(tool) : `${formatToolName(tool)}: ${targets.join(', ')}`,
  );

  return tools.length === 0 ? 'no tools' : tools.join('; ');
}

const targetLimit = 60;

function formatTarget(call: ToolActivity): string | undefined {
  const text = findFinalURL(call) ?? findInputText(call.input);

  if (text === undefined || text === '') {
    return undefined;
  }

  const url = URL.parse(text);
  const target = url === null || url.hostname === '' ? text : formatShortURL(url);

  return target.length > targetLimit ? `${target.slice(0, targetLimit)}…` : target;
}

// A fetch by link ID names no URL in its input, and a fetch by URL can end at another page after a
// redirect, so the URL the fetch returned names the page it read.
const fetchResultSchema = z.object({ result: z.object({ url: z.string() }) });

function findFinalURL(call: ToolActivity): string | undefined {
  return call.tool === 'web_fetch'
    ? fetchResultSchema.safeParse(call.content).data?.result.url
    : undefined;
}

function findInputText(input: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const text = Object.values(input ?? {}).find((value) => typeof value === 'string');

  return typeof text === 'string' ? text : undefined;
}

function formatShortURL(url: URL): string {
  const host = url.hostname.replace(/^www\./u, '');
  const path = url.pathname.replace(/\/$/u, '');

  return `${host}${path}`;
}

function formatToolName(tool: string): string {
  return tool.replaceAll(/[_.]+/gu, ' ');
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000;

  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}
