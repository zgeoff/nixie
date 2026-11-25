import { buildToolRegistry } from '@heynixie/tools';
import type { RegisteredTool } from '@heynixie/tools';
import type { ProxyCalls } from '../call/types';
import type { ToolForm } from '../types';
import { buildProxiedDefinition } from './build-proxied-definition';

export type ProxiedToolBuild =
  | { readonly kind: 'built'; readonly tool: RegisteredTool }
  | { readonly kind: 'refused'; readonly reason: string };

// Builds the tool a pinned form registers as, through the registry's own checks. A form that the
// registry refuses comes back with the reason, so a listing can keep the tool hidden and say why.
export function buildProxiedTool(
  tool: string,
  form: ToolForm,
  calls: ProxyCalls,
  pinHash: string,
): ProxiedToolBuild {
  try {
    const found = buildToolRegistry([buildProxiedDefinition(tool, form, calls, pinHash)]).findTool(
      tool,
    );

    return found === null
      ? { kind: 'refused', reason: 'the registry holds no tool of this name' }
      : { kind: 'built', tool: found };
  } catch (error) {
    return {
      kind: 'refused',
      reason: `the registry refuses the form: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }
}
