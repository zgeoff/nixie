import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelAPI } from '@heynixie/wire';
import { parsePeriodStore } from '../periods/parse-period-store';
import { startModelGateway } from '../proxy/start-model-gateway';
import type { Measures } from '../types';
import { createCounterStore } from '../usage/create-counter-store';

export interface TestModelGateway {
  // the gateway's origin, which a deployment's turn_input_log source names
  readonly url: string;

  // the base URL of its one route, which a model profile names
  readonly baseURL: string;

  // the folder it spools captured requests to
  readonly spoolDir: string;

  // the control listener, which a gateway with periods serves and a gateway with limits does not
  readonly control: { readonly url: string; readonly token: string } | null;

  // the file the host command writes to, null for a gateway with limits
  readonly overridePath: string | null;

  // what it has counted so far, which a reply adds to once it has ended; with periods, the day's
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

  // what it counts against, which is 100 dollars unless a caller names its own; ignored with periods
  readonly limits?: { readonly dollars?: number; readonly tokens?: number };

  // counts a day and a month in place of one total, with a control listener on a free port, and
  // limits of null until a caller sets them through the control listener
  readonly periods?: {
    readonly zone: string;
    readonly caps?: {
      readonly day?: Measures;
      readonly month?: Measures;
    };
    readonly countBySandbox?: boolean;

    // the clock the day and the month reset by
    readonly now?: () => number;
  };
}

export const testGatewayControlToken = 'test-control-token';

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
  const periods = options.periods;
  const overridePath = join(directory, 'override.json');
  const tokenFile = join(directory, 'control-token');

  if (periods !== undefined) {
    await writeFile(tokenFile, `${testGatewayControlToken}\n`);
  }

  await writeFile(
    join(directory, 'proxy.yaml'),
    [
      `listen: { port: ${String(options.port ?? 0)} }`,
      `store: ${join(directory, 'counter.json')}`,
      ...(periods === undefined
        ? [`limits: { ${limitEntries.join(', ')} }`]
        : [
            `periods: { zone: ${periods.zone} }`,
            `caps: ${JSON.stringify(periods.caps ?? {})}`,
            `control: { listen: { port: 0 }, tokenFile: ${tokenFile} }`,
            `countBySandbox: ${String(periods.countBySandbox ?? false)}`,
            `override: ${overridePath}`,
          ]),
      ...(options.capture === false ? [] : ['capture:', `  spool: ${spoolDir}`]),
      'routes:',
      '  scripted:',
      `    api: ${options.api ?? 'anthropic-messages'}`,
      `    upstream: ${options.upstreamURL}`,
      `    model: ${options.model ?? 'claude-test-1'}`,
      `    prices: ${JSON.stringify(testGatewayPrices)}`,
      '    maxOutputTokens: 64000',
    ].join('\n'),
  );

  const gateway = await startModelGateway({
    configPath: join(directory, 'proxy.yaml'),
    log: () => {},
    waitForDrainDeadline: () => Promise.resolve(),
    ...(periods?.now === undefined ? {} : { now: periods.now }),
  });

  onTestFinished(async () => {
    await gateway.stop();

    await rm(directory, { recursive: true, force: true });
  });

  const readCount =
    periods === undefined
      ? await createLimitsCountReader(join(directory, 'counter.json'))
      : createPeriodsCountReader(join(directory, 'counter.json'));

  return {
    url: gateway.url,
    baseURL: `${gateway.url}/scripted`,
    spoolDir,
    control:
      gateway.controlURL === null
        ? null
        : { url: gateway.controlURL, token: testGatewayControlToken },
    overridePath: periods === undefined ? null : overridePath,
    readCount,
  };
}

async function createLimitsCountReader(path: string): Promise<TestModelGateway['readCount']> {
  const store = await createCounterStore(path);

  return async () => {
    const stored = await store.read();

    return { dollars: stored.dollars, tokens: stored.tokens };
  };
}

function createPeriodsCountReader(path: string): TestModelGateway['readCount'] {
  // a plain read of the file: a second store handle would write a reset beside the gateway's own
  return async () => {
    const stored: unknown = await Bun.file(path).json();

    const store = parsePeriodStore(stored);

    return { dollars: store.periods.day.dollars, tokens: store.periods.day.tokens };
  };
}
