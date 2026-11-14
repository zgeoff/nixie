import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { ProbeTarget } from './types';

export function buildProbeOptions(target: ProbeTarget): Options {
  return {
    cwd: target.directory,
    model: pickProbeModel(target.env),
    settingSources: [],
    tools: [],
    maxTurns: 1,
    settings: { autoMemoryEnabled: false, autoDreamEnabled: false },
    env: { ...target.env },
  };
}

function pickProbeModel(env: Readonly<Record<string, string>>): string {
  return env['NIXIE_SDK_CONTRACT_MODEL'] ?? 'claude-haiku-5-5';
}
