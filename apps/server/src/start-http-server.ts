import type { APIContext } from '@heynixie/api';
import { buildAPIApp } from '@heynixie/api';
import type { Writer } from '@heynixie/log';
import { buildHealthApp, checkDatabase } from '@heynixie/ops';
import { Elysia } from 'elysia';
import type { APIGate } from './build-api-gate';
import { buildReadinessChecks } from './build-readiness-checks';
import type { StartState } from './build-start-state';
import type { DeploymentConfig } from './deployment-config-schema';
import type { Tools } from './start-tools';
import type { Cleanup } from './types';

export interface HTTPServerOptions {
  readonly config: DeploymentConfig;
  readonly writer: Writer;
  readonly state: StartState;
  readonly tools: Tools;
  readonly apiContext: APIContext;
  readonly cleanup: Cleanup;

  // the gate a reset closes, which every request passes through
  readonly gate: APIGate;
}

// Serves the health endpoint and the API on the configured address. Liveness holds while the
// process answers and the database opens; readiness lists the slice 1 parts.
export async function startHTTPServer(options: HTTPServerOptions): Promise<number> {
  const app = new Elysia()
    .use(
      buildHealthApp({
        liveness: {
          process: () => Promise.resolve({ isReady: true, reason: null }),
          database: () => checkDatabase(options.writer.db),
        },
        readiness: buildReadinessChecks(
          options.state,
          options.tools.adapter,
          options.config.server.dataDir,
        ),
      }),
    )
    .use(buildAPIApp(options.apiContext));
  const http = Bun.serve({
    hostname: options.config.server.hostname,
    port: options.config.server.port,
    fetch: (request) => options.gate.run(request, (passed) => app.handle(passed)),
  });

  await options.cleanup.defer(() => http.stop(true));
  return http.port ?? options.config.server.port;
}
