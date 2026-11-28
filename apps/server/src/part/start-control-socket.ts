import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ControlSocketOptions {
  readonly path: string;
  readonly respond: (request: Request) => Promise<Response>;
}

export interface ControlSocket {
  readonly stop: () => Promise<void>;
}

export async function startControlSocket(options: ControlSocketOptions): Promise<ControlSocket> {
  await mkdir(dirname(options.path), { recursive: true, mode: 0o700 });
  await rm(options.path, { force: true });

  // an export answers only when it finishes, which can outlast Bun's 10-second idle timeout
  const server = Bun.serve({ unix: options.path, idleTimeout: 0, fetch: options.respond });

  return {
    stop: async () => {
      await server.stop();

      await rm(options.path, { force: true });
    },
  };
}
