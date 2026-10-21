import { expect, onTestFinished } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { runWebBuildOnce } from './run-web-build-once';

export async function startBuiltWeb(apiURL: string): Promise<{ url: string }> {
  const serverPath = await runWebBuildOnce();

  const portProbe = Bun.serve({ fetch: answerProbe, hostname: '127.0.0.1', port: 0 });
  const port = portProbe.port;

  await portProbe.stop(true);

  const child = Bun.spawn(['bun', serverPath], {
    env: { ...process.env, NIXIE_API_URL: apiURL, NODE_ENV: 'production', PORT: String(port) },
    stderr: 'inherit',
    stdout: 'ignore',
  });

  onTestFinished(async () => {
    child.kill();

    await child.exited;
  });

  const url = `http://127.0.0.1:${port}`;

  await waitFor(
    async () => {
      const live = await fetch(`${url}/health/live`);

      expect(live.status).toBe(200);
    },
    { timeout: 10_000 },
  );

  return { url };
}

function answerProbe(): Response {
  return new Response();
}
