import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startModelGateway } from '../start-model-gateway';

export interface TestModelGateway {
  // the gateway's origin, which a deployment's turn_input_log source names
  readonly url: string;

  // the base URL of its one route, which a model profile names
  readonly baseURL: string;

  // the folder it spools captured requests to
  readonly spoolDir: string;
}

// An in-process gateway with one route to an upstream, counting against no real budget.
export async function startTestModelGateway(upstreamURL: string): Promise<TestModelGateway> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-gateway-'));

  const spoolDir = join(directory, 'spool');

  await mkdir(spoolDir);

  await writeFile(
    join(directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(directory, 'counter.json')}`,
      'limits: { dollars: 100 }',
      'capture:',
      `  spool: ${spoolDir}`,
      'routes:',
      '  scripted:',
      `    upstream: ${upstreamURL}`,
      '    model: claude-test-1',
      '    prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
    ].join('\n'),
  );

  const gateway = await startModelGateway({
    configPath: join(directory, 'proxy.yaml'),
    log: () => {},
    waitForDrainDeadline: () => Promise.resolve(),
  });

  onTestFinished(async () => {
    await gateway.stop();

    await rm(directory, { recursive: true, force: true });
  });

  return { url: gateway.url, baseURL: `${gateway.url}/scripted`, spoolDir };
}
