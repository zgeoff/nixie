import type { SandboxSpec } from './types';

const loopback = ['127.0.0.1', 'localhost'];

export function mergeExecEnv(
  spec: SandboxSpec,
  env: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const merged: Record<string, string> = {};

  for (const grant of spec.grants) {
    Object.assign(merged, grant.env);
  }

  Object.assign(merged, env);

  const noProxy = [
    ...new Set([...splitHosts(env?.['NO_PROXY'] ?? env?.['no_proxy'] ?? ''), ...loopback]),
  ].join(',');

  merged['NO_PROXY'] = noProxy;
  merged['no_proxy'] = noProxy;

  return merged;
}

function splitHosts(value: string): readonly string[] {
  return value
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}
