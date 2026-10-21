import { healthReportSchema } from '@heynixie/ops';
import { loadDeploymentConfig } from './load-deployment-config';
import { loadSandboxManifest } from './load-sandbox-manifest';
import type { CLIIO, Command } from './types';

export function createDeploymentCommands(): readonly (readonly [string, Command])[] {
  return [
    ['health', (flags, io) => runHealth(flags.config, flags.live, io)],
    ['sandbox-manifest', (flags, io) => runSandboxManifest(flags.manifest, io)],
  ];
}

async function runHealth(configPath: string, isLive: boolean, io: CLIIO): Promise<number> {
  const config = await loadDeploymentConfig(configPath);

  // A server on a wildcard address answers on loopback inside its container.
  const isWildcard = ['0.0.0.0', '::'].includes(config.server.hostname);
  const host = isWildcard ? '127.0.0.1' : config.server.hostname;
  const path = isLive ? 'live' : 'ready';

  const response = await Bun.fetch(`http://${host}:${config.server.port}/health/${path}`);
  const report = await response.text();

  io.print(report);

  return healthReportSchema.parse(JSON.parse(report)).status === 'ready' ? 0 : 1;
}

async function runSandboxManifest(manifestPath: string, io: CLIIO): Promise<number> {
  const images = await loadSandboxManifest(manifestPath);

  io.print(JSON.stringify(images));

  return 0;
}
