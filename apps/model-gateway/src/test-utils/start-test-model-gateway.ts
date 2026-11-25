import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelAPI } from '@heynixie/wire';
import type { LoginFile } from '../login/login-file-schema';
import { writeLoginFile } from '../login/write-login-file';
import { parsePeriodStore } from '../periods/parse-period-store';
import { startModelGateway } from '../proxy/start-model-gateway';
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

  // what it has counted so far, which a reply adds to once it has ended; with periods, the day's of
  // the route `scripted`, whose tokens are not counted
  readonly readCount: () => Promise<{ readonly dollars: number; readonly tokens: number }>;
}

export interface TestPlanRoute {
  // the route ID, which a profile's ID names
  readonly routeID: string;

  // the login file the route starts with, or null for a route with no login
  readonly login: LoginFile | null;
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

  // adds a plan route, which needs periods; its refresh answers 503, so it never reaches the real
  // token endpoint
  readonly planRoute?: TestPlanRoute;

  // counts each route's day and month in place of one total, with a control listener on a free
  // port
  readonly periods?: {
    readonly zone: string;

    // the limits of the route `scripted` in US dollars: 100 a day and 1000 a month unless a caller
    // names its own, and none with null, which refuses every request on it
    readonly limits?: { readonly day: number; readonly month: number } | null;

    // a second route to the same upstream, with its own limits
    readonly secondRoute?: {
      readonly id: string;
      readonly limits: { readonly day: number; readonly month: number } | null;
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

const defaultLimits = { day: 100, month: 1000 };

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

  const planRouteLines = await writePlanRoute(directory, options.planRoute);

  const scriptedLimits = periods === undefined ? null : (periods.limits ?? defaultLimits);

  await writeFile(
    join(directory, 'proxy.yaml'),
    [
      `listen: { port: ${String(options.port ?? 0)} }`,
      `store: ${join(directory, 'counter.json')}`,
      ...(periods === undefined
        ? [`limits: { ${limitEntries.join(', ')} }`]
        : [
            `periods: { zone: ${periods.zone} }`,
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
      ...buildLimitsLines(scriptedLimits),
      ...buildSecondRouteLines(options),
      ...planRouteLines,
    ].join('\n'),
  );

  const gateway = await startModelGateway({
    configPath: join(directory, 'proxy.yaml'),
    log: () => {},
    waitForDrainDeadline: () => Promise.resolve(),
    authFetch: () => Promise.resolve(new Response('{}', { status: 503 })),
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

async function writePlanRoute(
  directory: string,
  plan: TestPlanRoute | undefined,
): Promise<string[]> {
  if (plan === undefined) {
    return [];
  }

  const loginPath = join(directory, 'plan-login.json');
  const routeKeyFile = join(directory, 'plan-route-key');

  await writeFile(routeKeyFile, 'test-plan-route-key\n');

  if (plan.login !== null) {
    await writeLoginFile(loginPath, plan.login);
  }

  return [
    `  ${plan.routeID}:`,
    '    api: openai-responses',
    '    upstream: https://chatgpt.example.test/backend-api/codex',
    '    model: gpt-test-1',
    `    prices: ${JSON.stringify(testGatewayPrices)}`,
    '    maxOutputTokens: 64000',
    '    login:',
    `      file: ${loginPath}`,
    `      routeKeyFile: ${routeKeyFile}`,
  ];
}

function buildLimitsLines(
  limits: { readonly day: number; readonly month: number } | null,
): string[] {
  return limits === null
    ? []
    : [`    limits: { day: ${String(limits.day)}, month: ${String(limits.month)} }`];
}

function buildSecondRouteLines(options: TestModelGatewayOptions): string[] {
  const second = options.periods?.secondRoute;

  if (second === undefined) {
    return [];
  }

  return [
    `  ${second.id}:`,
    `    api: ${options.api ?? 'anthropic-messages'}`,
    `    upstream: ${options.upstreamURL}`,
    `    model: ${options.model ?? 'claude-test-1'}`,
    `    prices: ${JSON.stringify(testGatewayPrices)}`,
    '    maxOutputTokens: 64000',
    ...buildLimitsLines(second.limits),
  ];
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

    return { dollars: store.routes['scripted']?.day.dollars ?? 0, tokens: 0 };
  };
}
