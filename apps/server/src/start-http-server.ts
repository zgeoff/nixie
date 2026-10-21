import type { APIContext, ReadViewMemory } from '@heynixie/api';
import { createAPIApp } from '@heynixie/api';
import type { Writer } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { Elysia } from 'elysia';
import type { APIGate } from './build-api-gate';
import type { StartState } from './build-start-state';
import type { DeploymentConfig } from './deployment-config-schema';
import { startServerHealth } from './start-server-health';
import type { Tools } from './tools';
import type { Cleanup } from './types';

export interface HTTPServerOptions {
  readonly config: DeploymentConfig;
  readonly writer: Writer;
  readonly state: StartState;
  readonly tools: Tools;
  readonly apiContext: APIContext;
  readonly cleanup: Cleanup;
  readonly log: Logger;

  readonly readMemory: ReadViewMemory;

  readonly gate: APIGate;
}

export async function startHTTPServer(options: HTTPServerOptions): Promise<number> {
  const health = await startServerHealth({
    writer: options.writer,
    state: options.state,
    adapter: options.tools.adapter,
    dataDir: options.config.server.dataDir,
    clock: options.apiContext.clock,
    cleanup: options.cleanup,
    log: options.log,
  });

  const app = new Elysia().use(health).use(createAPIApp(options.apiContext, options.readMemory));

  const answerRequest = (request: Request) =>
    options.gate.run(request, (passed) => app.handle(passed));

  const http = Bun.serve({
    hostname: options.config.server.hostname,
    port: options.config.server.port,
    fetch: answerRequest,
  });

  await options.cleanup.defer(() => http.stop(true));

  return http.port ?? options.config.server.port;
}
