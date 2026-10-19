import { healthStatuses } from '@heynixie/ops';
import { z } from 'zod';
import { loadDeploymentConfig } from './load-deployment-config';
import { loadSandboxManifest } from './load-sandbox-manifest';
import type { CLIIO, Command } from './types';

// The commands a deployment's checks run in the container: health prints the readiness report, or
// the liveness report with --live, and exits 0 only on the status ready, degraded included as a
// failure; sandbox-manifest prints each sandbox kind's image with the name nixie gives it in impd.
export function buildDeploymentCommands(): readonly (readonly [string, Command])[] {
  return [
    ['health', (flags, io) => runHealth(flags.config, flags.live, io)],
    ['sandbox-manifest', (flags, io) => runSandboxManifest(flags.manifest, io)],
  ];
}

// the part of a health answer the exit code reads, with the statuses the health endpoint reports
const healthAnswerSchema = z.object({ status: z.enum(healthStatuses) });

// the container runtime's check from inside the container, where a wildcard address answers on
// loopback
async function runHealth(configPath: string, isLive: boolean, io: CLIIO): Promise<number> {
  const config = await loadDeploymentConfig(configPath);

  const isWildcard = ['0.0.0.0', '::'].includes(config.server.hostname);
  const host = isWildcard ? '127.0.0.1' : config.server.hostname;
  const path = isLive ? 'live' : 'ready';

  const response = await Bun.fetch(`http://${host}:${config.server.port}/health/${path}`);
  const report = await response.text();

  io.print(report);

  return healthAnswerSchema.parse(JSON.parse(report)).status === 'ready' ? 0 : 1;
}

// the manifest as the server loads it, so a manifest the server refuses fails here too
async function runSandboxManifest(manifestPath: string, io: CLIIO): Promise<number> {
  const images = await loadSandboxManifest(manifestPath);

  io.print(JSON.stringify(images));

  return 0;
}
