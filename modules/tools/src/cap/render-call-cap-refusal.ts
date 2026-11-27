import type { ToolRun } from '../types';
import { callCapRefusal } from './call-cap-refusal';

export function renderCallCapRefusal(run: ToolRun, tool: string): string {
  const cap = run.taskRun?.calls[tool] ?? 0;

  return callCapRefusal.replace('{n}', String(cap)).replace('{tool}', tool);
}
