import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindHarness } from '@heynixie/models';
import { buildMockCodexProfile } from '@heynixie/models/test-utils';
import { buildSandboxSpec, sandboxSizes } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { buildGatewayBaseURL } from '@heynixie/spend';
import { createSpendGateway } from '@heynixie/spend-model-gateway';
import type { GuestFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeHostFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';
import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';

// These cases run a turn on a real plan login, through a model gateway that holds a plan route with
// a login. docs/runbooks/imp-isolation-tests.md names the variables, and the suite skips until
// `NIXIE_IMP_TEST_CODEX_PLAN_GATEWAY` is set.
const hasPlanGateway =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '') !== '' &&
  (process.env['NIXIE_IMP_TEST_CODEX_PLAN_GATEWAY'] ?? '') !== '' &&
  (process.env['NIXIE_IMP_TEST_CODEX_PLAN_CONTROL'] ?? '') !== '' &&
  (process.env['NIXIE_IMP_TEST_CODEX_PLAN_CONTROL_TOKEN'] ?? '') !== '' &&
  (process.env['NIXIE_IMP_TEST_CODEX_PLAN_ROUTE_KEY'] ?? '') !== '';

interface TurnOptions {
  readonly systemPrompt: string;
  readonly input: string;

  // the results the tool server serves by tool name; no server starts when it is left out
  readonly tools?: Readonly<Record<string, string>>;
}

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const routeID = process.env['NIXIE_IMP_TEST_CODEX_PLAN_ROUTE'] ?? 'gpt-6-luna';

  const testRecorder = await setupTestRecorder();

  const config = parseImpConfig({
    IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
    IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
    IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
    IMP_EGRESS_DENY: process.env['NIXIE_IMP_TEST_EGRESS_DENY'],
  });

  const port = buildImpPort(config);

  const directory = await mkdtemp(join(tmpdir(), 'nixie-codex-plan-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const socketPath = join(directory, 'tools.sock');

  const adapter = buildImpSandboxAdapter({
    port,
    recorder: testRecorder.recorder,
    config,
    toolTarget: () => ({ path: socketPath }),
  });

  const spend = createSpendGateway({
    url: process.env['NIXIE_IMP_TEST_CODEX_PLAN_CONTROL'] ?? '',
    token: process.env['NIXIE_IMP_TEST_CODEX_PLAN_CONTROL_TOKEN'] ?? '',
  });

  const secretName = `nixie-test-${crypto.randomUUID().slice(0, 8)}`;

  const held = await port.readSecretHosts(secretName);

  expect(held).toBeNull();

  // the broker sets the route key as a bearer header on each request to chatgpt.com, and sends it
  // to the gateway's model listener
  await port.addSecret({
    name: secretName,
    value: process.env['NIXIE_IMP_TEST_CODEX_PLAN_ROUTE_KEY'] ?? '',
    host: 'chatgpt.com',
    header: 'authorization',
    scheme: 'bearer',
    upstream: process.env['NIXIE_IMP_TEST_CODEX_PLAN_GATEWAY'] ?? '',
  });

  stack.defer(() => port.removeSecret(secretName));

  const startToolServer = (token: string, results: Readonly<Record<string, string>>) => {
    const handler = createMcpHandler(() => {
      // oxlint-disable-next-line typescript/no-deprecated -- the Server class that nixie's tool endpoint serves
      const server = new Server(
        { name: 'nixie', version: '0.0.0' },
        { capabilities: { tools: { listChanged: true } } },
      );

      server.setRequestHandler('tools/list', () => ({
        tools: Object.keys(results).map((name) => ({
          name,
          description: `Serves ${name}.`,
          inputSchema: { type: 'object' },
        })),
      }));

      server.setRequestHandler('tools/call', (request) => ({
        content: [{ type: 'text', text: results[request.params.name] ?? '' }],
      }));

      return server;
    });

    const answerRequest = (request: Request) =>
      request.headers.get('authorization') === `Bearer ${token}`
        ? handler.fetch(request)
        : Promise.resolve(new Response('unauthorized', { status: 401 }));

    const toolServer = Bun.serve({ unix: socketPath, fetch: answerRequest });

    stack.defer(() => toolServer.stop(true));
  };

  // Runs one turn in a codex sandbox on the plan profile, and returns every frame up to its end and
  // the tokens that the gateway counted for the sandbox.
  const runTurn = async (options: TurnOptions) => {
    const toolToken = crypto.randomUUID();

    const logins = await spend.readChatGPTLogins();

    invariant(logins.kind === 'ok', 'the gateway answered for its plan logins');

    const login = logins.value[routeID];

    invariant(login?.status === 'active', 'the plan route holds an active login');
    invariant(login.accountID !== null && login.planType !== null, 'the login names its account');

    const harness = bindHarness(
      buildMockCodexProfile({
        id: routeID,
        baseURL: 'https://chatgpt.com',
        model: process.env['NIXIE_IMP_TEST_CODEX_PLAN_MODEL'] ?? 'gpt-6-luna',
        chatgptLogin: true,
      }),
    );

    if (options.tools !== undefined) {
      startToolServer(toolToken, options.tools);
    }

    const sandbox = await adapter.create(
      buildSandboxSpec({
        kind: 'worker',
        image: process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '',
        owner: 'codex_plan_check',
        limits: sandboxSizes.codexTask,
        modelGrant: harness.buildGrant({
          name: secretName,
          value: null,
          host: 'chatgpt.com',
          header: 'bearer',
        }),
      }),
    );

    stack.defer(() => sandbox.destroy());

    const registered = await spend.putSandbox(sandbox.id, null);

    expect(registered).toStrictEqual({ kind: 'ok' });

    stack.defer(async () => {
      await spend.removeSandbox(sandbox.id);
    });

    const route = await sandbox.toolRoute();

    invariant(route !== null, 'a worker sandbox has a tool route');

    const stream = await sandbox.spawn({
      argv: ['bun', '--no-install', '/app/codex/main.js'],
      env: { HOME: '/home/nixie' },
      maxMessageBytes: turnFrameLimitBytes,
    });

    stack.defer(async () => {
      await stream.stop();
    });

    const baseURL = buildGatewayBaseURL('https://chatgpt.com', {
      sandboxName: sandbox.id,
      profileID: routeID,
    });

    const turnProfile = harness.toTurnProfile('kept');

    invariant(turnProfile.harness === 'codex', 'a codex profile gives a codex turn profile');

    await stream.send(
      encodeHostFrame(harness.capabilities, {
        type: 'turn',
        profile: {
          ...turnProfile,
          baseURL,
          chatgptLogin: { accountID: login.accountID, planType: login.planType },
        },
        tools: { url: route.url, token: toolToken },
        systemPrompt: options.systemPrompt,
        input: [{ uuid: crypto.randomUUID(), text: options.input }],
        limits: { modelCalls: null, toolCallWaitMs: null },
      }),
    );

    const frames: GuestFrame[] = [];

    for await (const message of stream.messages) {
      const frame = decodeTurnFrame(guestFrameSchema, message);

      frames.push(frame);

      if (frame.type === 'ended' || frame.type === 'failed') {
        break;
      }
    }

    const counted = await spend.readSandbox(sandbox.id);

    return { frames, counted };
  };

  return { runTurn };
}

test.skipIf(!hasPlanGateway)(
  'it runs a turn that calls a tool on the plan login, and the gateway counts every call frame',
  async () => {
    const ctx = await setupTest();

    const turn = await ctx.runTurn({
      systemPrompt: 'You are a test agent. Call the ping tool once, then reply with the word done.',
      input: 'Call the ping tool.',
      tools: { ping: 'pong' },
    });

    const usages = turn.frames.flatMap((frame) => (frame.type === 'call' ? [frame.usage] : []));

    const expectedTokens = usages.reduce(
      (sum, usage) =>
        sum +
        usage.uncachedInputTokens +
        usage.cacheReadTokens +
        usage.cacheWrite5mTokens +
        usage.cacheWrite1hTokens +
        usage.outputTokens,
      0,
    );

    console.log(
      `plan login count probe: ${String(usages.length)} call frames sum to ${String(expectedTokens)} tokens; the gateway counted ${JSON.stringify(turn.counted)}; last frame ${JSON.stringify(turn.frames.at(-1))}`,
    );

    expect(turn.frames.at(-1)).toMatchObject({ type: 'ended', outcome: 'finished' });
    expect(usages.length).toBeGreaterThanOrEqual(2);
    expect(turn.counted).toMatchObject({ kind: 'ok', value: { tokens: expectedTokens } });
  },
);

test.skipIf(!hasPlanGateway)(
  'it fails a plan login turn that passes the context window with an error that names the context',
  async () => {
    const ctx = await setupTest();

    // far past any model window, so the turn cannot fit
    const filler = 'The tide gauge reads high. '.repeat(400_000);

    const turn = await ctx.runTurn({
      systemPrompt: 'You are a test agent.',
      input: filler,
      tools: { ping: 'pong' },
    });

    console.log(`plan login context overflow probe: ${JSON.stringify(turn.frames.at(-1))}`);

    // an unrelated failure, such as tools_not_connected, has another reason or detail
    expect(turn.frames.at(-1)).toStrictEqual({
      type: 'failed',
      reason: 'error',
      detail: expect.stringMatching(/context/iu),
    });
  },
);
