import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ControlSocketOptions {
  // a Unix socket in a directory only nixie's user may enter
  readonly path: string;
  readonly createEnrolmentCode: () => Promise<EnrolmentCode>;
}

export interface EnrolmentCode {
  readonly code: string;
  readonly expiresAt: Date;
}

export interface ControlSocket {
  readonly stop: () => Promise<void>;
}

// Starts the control socket that host commands reach the server through, since only the writer
// lock's holder may write. It serves enrolment codes. A stale socket file is removed first: the
// writer lock already proves no other server runs.
export async function startControlSocket(options: ControlSocketOptions): Promise<ControlSocket> {
  await mkdir(dirname(options.path), { recursive: true, mode: 0o700 });
  await rm(options.path, { force: true });

  const server = Bun.serve({
    unix: options.path,
    fetch: async (request) => {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/enrolment-codes') {
        return new Response('not found', { status: 404 });
      }
      const issued = await options.createEnrolmentCode();

      return Response.json({ code: issued.code, expiresAt: issued.expiresAt.toISOString() });
    },
  });

  return {
    stop: async () => {
      await server.stop(true);
      await rm(options.path, { force: true });
    },
  };
}
