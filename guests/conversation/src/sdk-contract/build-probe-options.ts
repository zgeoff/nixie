import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { ProbeTarget } from './types';

export function buildProbeOptions(target: ProbeTarget): Options {
  return {
    cwd: target.directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    maxTurns: 1,
    settings: { autoMemoryEnabled: false, autoDreamEnabled: false },
    env: { ...target.env },
  };
}
