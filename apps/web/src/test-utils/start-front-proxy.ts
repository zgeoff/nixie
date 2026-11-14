import { onTestFinished } from 'bun:test';
import type { FrontProxyTargets } from './create-front-proxy';
import { createFrontProxy } from './create-front-proxy';

export function startFrontProxy(targets: FrontProxyTargets) {
  const server = createFrontProxy(targets);

  onTestFinished(async () => {
    await server.stop(true);
  });

  return { url: `http://127.0.0.1:${server.port}` };
}
