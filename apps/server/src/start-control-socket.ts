import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ControlSocketOptions {
  // a Unix socket in a directory only nixie's user may enter
  readonly path: string;

  // answers each request on the socket, such as a call of a host procedure
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
  readonly respond: (request: Request) => Promise<Response>;
}

export interface ControlSocket {
  readonly stop: () => Promise<void>;
}

// Starts the control socket that host commands reach the server through, since only the writer
// lock's holder may write. A stale socket file is removed first: the writer lock already proves no
// other server runs.
export async function startControlSocket(options: ControlSocketOptions): Promise<ControlSocket> {
  await mkdir(dirname(options.path), { recursive: true, mode: 0o700 });
  await rm(options.path, { force: true });

  const server = Bun.serve({ unix: options.path, fetch: options.respond });

  // the stop lets a request in flight finish, so the reset's answer reaches its host command
  return {
    stop: async () => {
      await server.stop();

      await rm(options.path, { force: true });
    },
  };
}
