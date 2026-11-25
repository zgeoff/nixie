import type { CodingSettings, TargetRef } from '../types';
import type { CodingConfig } from './coding-config-schema';

// The settings of the coding module, from the coding section, which must hold an `atc` block.
export function buildCodingSettings(
  config: CodingConfig,
  atc: NonNullable<CodingConfig['atc']>,
): CodingSettings {
  return {
    wake: config.wake,
    targets: atc.targets,
    defaultTarget: toTarget(atc.defaultTarget),
    ...(atc.agent === undefined ? {} : { agent: atc.agent }),
    toolWaitMs: config.toolWaitMs,
  };
}

function toTarget(reference: string): TargetRef {
  const [daemon = '', target = ''] = reference.split('/');

  return { daemon, target };
}
