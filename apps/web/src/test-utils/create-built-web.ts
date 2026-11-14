import { waitForCondition } from '@heynixie/testing';

export interface BuiltWeb {
  readonly url: string;

  readonly stop: () => Promise<void>;
}

// Starts the web client's server build on a free port, and resolves once it answers its live check.
export async function createBuiltWeb(apiURL: string, serverPath: string): Promise<BuiltWeb> {
  const portProbe = Bun.serve({ fetch: answerProbe, hostname: '127.0.0.1', port: 0 });
  const port = portProbe.port;

  await portProbe.stop(true);

  const child = Bun.spawn(['bun', serverPath], {
    env: { ...process.env, NIXIE_API_URL: apiURL, NODE_ENV: 'production', PORT: String(port) },
    stderr: 'inherit',
    stdout: 'ignore',
  });

  const stop = async () => {
    child.kill();

    await child.exited;
  };

  const url = `http://127.0.0.1:${port}`;

  await waitForCondition(() => probeLive(url), { timeoutMs: 10_000, intervalMs: 50 }).catch(
    async (error: unknown) => {
      await stop();

      throw error;
    },
  );

  return { url, stop };
}

function answerProbe(): Response {
  return new Response();
}

async function probeLive(url: string): Promise<boolean> {
  const live = await fetch(`${url}/health/live`).catch(() => null);

  return live?.status === 200;
}
