import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelAPI } from '@heynixie/wire';
import type { LoginFile } from '../login/login-file-schema';
import { writeLoginFile } from '../login/write-login-file';
import { parsePeriodStore } from '../periods/parse-period-store';
import { toDollars } from '../periods/to-dollars';
import { startModelGateway } from '../proxy/start-model-gateway';
import { testGatewayProvider } from './constants';

export interface TestModelGateway {
  // stops the gateway and removes its folder
  readonly stop: () => Promise<void>;

  // the gateway's origin, which a deployment's turn_input_log source names
  readonly url: string;

  // the base URL of its one route, which a model profile names
  readonly baseURL: string;

  // the folder it spools captured requests to
  readonly spoolDir: string;

  readonly control: { readonly url: string; readonly token: string };

  // the file the host command writes to
  readonly overridePath: string;

  // what it has counted so far, which a reply adds to once it has ended: the day's dollars of the
  // route `scripted`
  readonly readCount: () => Promise<{ readonly dollars: number }>;
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

  // adds a plan route; its refresh answers 503, so it never reaches the real
  // token endpoint
  readonly planRoute?: TestPlanRoute;

  // how it counts each route's day and month, with a control listener on a free port
  readonly periods?: {
    readonly zone: string;

    // the limits of the route `scripted` in US dollars: 100 a day and 1000 a month unless a caller
    // names its own, and none with null, which leaves the route to its provider's limits
    readonly limits?: { readonly day: number; readonly month: number } | null;

    // the limits of the provider `test`, which every route is on unless it names another:
    // 10000 a day and 100000 a month unless a caller names its own
    readonly providerLimits?: { readonly day: number; readonly month: number };

    // a second provider, whose limits a second route may name
    readonly secondProvider?: {
      readonly id: string;
      readonly limits: { readonly day: number; readonly month: number };
    };

    // a second route to the same upstream, with its own limits, on the provider `test` unless it
    // names another
    readonly secondRoute?: {
      readonly id: string;
      readonly limits: { readonly day: number; readonly month: number } | null;
      readonly provider?: string;
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
const defaultProviderLimits = { day: 10_000, month: 100_000 };

// An in-process gateway with one route to an upstream, counting against no real budget. It stops
// when the test ends.
export async function startTestModelGateway(
  options: TestModelGatewayOptions,
): Promise<TestModelGateway> {
  const gateway = await createTestModelGateway(options);

  onTestFinished(gateway.stop);

  return gateway;
}

// The same gateway for a caller that is no test, such as the verify harness, which stops it itself.
export async function createTestModelGateway(
  options: TestModelGatewayOptions,
): Promise<TestModelGateway> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-gateway-'));

  const spoolDir = join(directory, 'spool');

  await mkdir(spoolDir);

  const periods: NonNullable<TestModelGatewayOptions['periods']> = options.periods ?? {
    zone: 'UTC',
  };

  const overridePath = join(directory, 'override.json');
  const tokenFile = join(directory, 'control-token');

  await writeFile(tokenFile, `${testGatewayControlToken}\n`);

  const planRouteLines = await writePlanRoute(directory, options.planRoute);

  const scriptedLimits = periods.limits === undefined ? defaultLimits : periods.limits;

  await writeFile(
    join(directory, 'proxy.yaml'),
    [
      `listen: { port: ${String(options.port ?? 0)} }`,
      `store: ${join(directory, 'counter.json')}`,
      `periods: { zone: ${periods.zone} }`,
      `control: { listen: { port: 0 }, tokenFile: ${tokenFile} }`,
      `countBySandbox: ${String(periods.countBySandbox ?? false)}`,
      `override: ${overridePath}`,
      ...(options.capture === false ? [] : ['capture:', `  spool: ${spoolDir}`]),
      'providers:',
      `  ${testGatewayProvider}:`,
      ...buildLimitsLines(periods.providerLimits ?? defaultProviderLimits),
      ...buildSecondProviderLines(options),
      'routes:',
      '  scripted:',
      `    provider: ${testGatewayProvider}`,
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
    ...(periods.now === undefined ? {} : { now: periods.now }),
  });

  const readCount = createPeriodsCountReader(join(directory, 'counter.json'));

  return {
    stop: async () => {
      await gateway.stop();

      await rm(directory, { recursive: true, force: true });
    },
    url: gateway.url,
    baseURL: `${gateway.url}/scripted`,
    spoolDir,
    control: { url: gateway.controlURL, token: testGatewayControlToken },
    overridePath,
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
    `    provider: ${testGatewayProvider}`,
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

function buildSecondProviderLines(options: TestModelGatewayOptions): string[] {
  const second = options.periods?.secondProvider;

  return second === undefined ? [] : [`  ${second.id}:`, ...buildLimitsLines(second.limits)];
}

function buildSecondRouteLines(options: TestModelGatewayOptions): string[] {
  const second = options.periods?.secondRoute;

  if (second === undefined) {
    return [];
  }

  return [
    `  ${second.id}:`,
    `    provider: ${second.provider ?? testGatewayProvider}`,
    `    api: ${options.api ?? 'anthropic-messages'}`,
    `    upstream: ${options.upstreamURL}`,
    `    model: ${options.model ?? 'claude-test-1'}`,
    `    prices: ${JSON.stringify(testGatewayPrices)}`,
    '    maxOutputTokens: 64000',
    ...buildLimitsLines(second.limits),
  ];
}

function createPeriodsCountReader(path: string): TestModelGateway['readCount'] {
  // a plain read of the file: a second store handle would write a reset beside the gateway's own
  return async () => {
    const stored: unknown = await Bun.file(path).json();

    const store = parsePeriodStore(stored);

    return { dollars: toDollars(store.routes['scripted']?.day.micros ?? 0) };
  };
}
