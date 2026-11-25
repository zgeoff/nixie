import type { ToolForm } from '../types';
import { buildProxiedTool } from './build-proxied-tool';

// Why the registry refuses the form of a tool, or null when it registers.
export function pickFormRefusal(tool: string, form: ToolForm): string | null {
  const built = buildProxiedTool(tool, form);

  return built.kind === 'refused' ? built.reason : null;
}
