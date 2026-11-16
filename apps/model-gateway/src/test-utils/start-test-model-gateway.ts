import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelAPI } from '@heynixie/wire';
import { startModelGateway } from '../proxy/start-model-gateway';
import { createCounterStore } from '../usage/create-counter-store';

export interface TestModelGateway {
  // the gateway's origin, which a deployment's turn_input_log source names
  readonly url: string;

  // the base URL of its one route, which a model profile names
  readonly baseURL: string;

  // the folder it spools captured requests to
  readonly spoolDir: string;

  // what it has counted so far, which a reply adds to once it has ended
  readonly readCount: () => Promise<{ readonly dollars: number; readonly tokens: number }>;
}

export interface TestModelGatewayOptions {
  readonly upstreamURL: string;
  readonly api?: ModelAPI;

  // the model the route prices, which a request must name
  readonly model?: string;

  // a fixed port on the loopback address, for a caller that a relay must reach
  readonly port?: number;

  // whether it spools captured requests, which is on unless a caller turns it off
  readonly capture?: boolean;

  // what it counts against, which is 100 dollars unless a caller names its own
  readonly limits?: { readonly dollars?: number; readonly tokens?: number };
}

// the prices of its route, per million tokens
export const testGatewayPrices = {
  input: 1,
  cache_write: 1,
  cache_write_1h: 1,
  cached_input: 0.1,
  output: 4,
} as const;

// An in-process gateway with one route to an upstream, counting against no real budget.
export async function startTestModelGateway(
  options: TestModelGatewayOptions,
): Promise<TestModelGateway> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-gateway-'));

  const spoolDir = join(directory, 'spool');

  await mkdir(spoolDir);

  const limits = options.limits ?? { dollars: 100 };
  const limitEntries = Object.entries(limits).map(([name, value]) => `${name}: ${String(value)}`);

  await writeFile(
    join(directory, 'proxy.yaml'),
    [
      `listen: { port: ${String(options.port ?? 0)} }`,
      `store: ${join(directory, 'counter.json')}`,
      `limits: { ${limitEntries.join(', ')} }`,
      ...(options.capture === false ? [] : ['capture:', `  spool: ${spoolDir}`]),
      'routes:',
      '  scripted:',
      `    api: ${options.api ?? 'anthropic-messages'}`,
      `    upstream: ${options.upstreamURL}`,
      `    model: ${options.model ?? 'claude-test-1'}`,
      `    prices: ${JSON.stringify(testGatewayPrices)}`,
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

  const store = await createCounterStore(join(directory, 'counter.json'));

  return {
    url: gateway.url,
    baseURL: `${gateway.url}/scripted`,
    spoolDir,
    readCount: async () => {
      const stored = await store.read();

      return { dollars: stored.dollars, tokens: stored.tokens };
    },
  };
}
