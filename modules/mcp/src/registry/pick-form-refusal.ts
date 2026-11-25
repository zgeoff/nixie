import type { ProxyCalls } from '../call/types';
import type { ToolForm } from '../types';
import { buildProxiedTool } from './build-proxied-tool';

// The calls of a build that only asks the registry whether it accepts the form: nothing runs.
const checkOnlyCalls: ProxyCalls = {
  clear: () => Promise.resolve({ kind: 'cleared' }),
  send: () => Promise.resolve({ kind: 'failed', message: 'was never called' }),
};

// Why the registry refuses the form of a tool, or null when it registers.
export function pickFormRefusal(tool: string, form: ToolForm): string | null {
  const built = buildProxiedTool(tool, form, checkOnlyCalls, 'check-only');

  return built.kind === 'refused' ? built.reason : null;
}
