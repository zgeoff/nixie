import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestModelGateway, testGatewayPrices } from '@heynixie/model-gateway/test-utils';
import { bindHarness, buildCallCost, modelPricesSchema } from '@heynixie/models';
import { buildMockCodexProfile } from '@heynixie/models/test-utils';
import { buildSandboxSpec, sandboxSizes } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import type { GuestFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeCaptureTag,
  encodeHostFrame,
  guestFrameSchema,
  openSpoolFile,
  parseSpoolFileName,
  recallPageLimitBytes,
  turnFrameLimitBytes,
} from '@heynixie/wire';
import { createSpoolRecipient } from '@heynixie/wire/test-utils';
import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildRecallResult } from './test-utils/build-recall-result';
import { isCompactionRequest } from './test-utils/is-compaction-request';

// These tests need a real impd on a host with /dev/kvm and the codex image built into it. A turn
// reaches the model gateway on this machine through a relay imp that the runbook sets up:
// docs/runbooks/imp-isolation-tests.md names the variables that turn them on.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '') !== '';

const hasRelay =
  hasImpHost &&
  (process.env['NIXIE_IMP_TEST_CODEX_RELAY'] ?? '') !== '' &&
  (process.env['NIXIE_IMP_TEST_CODEX_GATEWAY_PORT'] ?? '') !== '';

interface TurnOptions {
  // a path segment between the route and /v1 in the profile's base URL
  readonly baseURLSegment?: string;

  // the results the tool server serves by tool name; no server starts when it is left out
  readonly tools?: Readonly<Record<string, string>>;
  readonly memoryMiB?: number;
}

async function setupTest() {
  const modelName = 'house-model-1';

  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const testRecorder = await setupTestRecorder();

  const config = parseImpConfig({
    IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
    IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
    IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
    IMP_EGRESS_DENY: process.env['NIXIE_IMP_TEST_EGRESS_DENY'],
  });

  const port = buildImpPort(config);

  const directory = await mkdtemp(join(tmpdir(), 'nixie-codex-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const socketPath = join(directory, 'tools.sock');

  const adapter = buildImpSandboxAdapter({
    port,
    recorder: testRecorder.recorder,
    config,
    toolTarget: () => ({ path: socketPath }),
  });

  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const gateway = await startTestModelGateway({
    upstreamURL: model.url,
    api: 'openai-responses',
    model: modelName,
    port: Number(process.env['NIXIE_IMP_TEST_CODEX_GATEWAY_PORT']),
  });

  // The broker answers only a host name, and an imp resolves only a granted one, so the model host
  // is a name of its own that the secret's upstream sends to the relay.
  const id = crypto.randomUUID().slice(0, 8);
  const modelHost = `models-${id}.example.com`;
  const secretName = `nixie-test-${id}`;
  const secretValue = `nixie-test-${crypto.randomUUID()}`;

  const held = await port.readSecretHosts(secretName);

  expect(held).toBeNull();

  await port.addSecret({
    name: secretName,
    value: secretValue,
    host: modelHost,
    header: 'authorization',
    scheme: 'bearer',
    upstream: process.env['NIXIE_IMP_TEST_CODEX_RELAY'] ?? '',
  });

  stack.defer(() => port.removeSecret(secretName));

  // Serves the given tools over MCP on the socket that the sandbox's tool route reaches.
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

  // Runs one turn in a codex sandbox and returns every frame up to the turn's end.
  const runTurn = async (options: TurnOptions) => {
    const toolToken = crypto.randomUUID();

    const harness = bindHarness(
      buildMockCodexProfile({
        baseURL: `https://${modelHost}/scripted${options.baseURLSegment ?? ''}/v1`,
        model: modelName,
      }),
    );

    if (options.tools !== undefined) {
      startToolServer(toolToken, options.tools);
    }

    const sandbox = await adapter.create(
      buildSandboxSpec({
        kind: 'worker',
        image: process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '',
        owner: 'codex_turn_check',
        limits: {
          ...sandboxSizes.codexTask,
          memoryMiB: options.memoryMiB ?? sandboxSizes.codexTask.memoryMiB,
        },
        modelGrant: harness.buildGrant({
          name: secretName,
          value: null,
          host: modelHost,
          header: 'bearer',
        }),
      }),
    );

    stack.defer(() => sandbox.destroy());

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

    await stream.send(
      encodeHostFrame(harness.capabilities, {
        type: 'turn',
        profile: harness.toTurnProfile('kept'),
        tools: { url: route.url, token: toolToken },
        systemPrompt: 'SYSTEM PROMPT MARKER',
        input: [{ uuid: crypto.randomUUID(), text: 'USER INPUT MARKER' }],
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

    return { frames, sandbox };
  };

  // What the gateway counted, once it has counted at least the tokens that the call frames report.
  const readCounted = async (frames: readonly GuestFrame[]) => {
    const prices = modelPricesSchema.parse(testGatewayPrices);
    const calls = frames.flatMap((frame) => (frame.type === 'call' ? [frame.usage] : []));

    const expected = {
      tokens: calls.reduce(
        (sum, usage) =>
          sum +
          usage.uncachedInputTokens +
          usage.cacheReadTokens +
          usage.cacheWrite5mTokens +
          usage.cacheWrite1hTokens +
          usage.outputTokens,
        0,
      ),
      dollars: calls.reduce((sum, usage) => sum + buildCallCost(usage, prices), 0),
    };

    const probeCounted = async () => {
      const counted = await gateway.readCount();

      return counted.tokens === expected.tokens;
    };

    try {
      await waitForCondition(probeCounted, { timeoutMs: 3000 });
    } catch {
      // the assertion that follows reports the count that never arrived
    }

    const counted = await gateway.readCount();

    return { counted, expected };
  };

  // The input of the model's nth request, as text.
  const readRequestText = (index: number): string => {
    const request = model.requests.at(index);

    return JSON.stringify(request?.body?.input ?? []);
  };

  return {
    stack,
    model,
    gateway,
    modelHost,
    secretValue,
    runTurn,
    readCounted,
    readRequestText,
  };
}

interface RequestTool {
  readonly type: string;
  readonly name?: string | null | undefined;
  readonly tools?: readonly RequestTool[] | undefined;
}

test.skipIf(!hasRelay)(
  'it gives the model only the 3 resource tools and nixie tools, and the secret as a bearer header',
  async () => {
    const ctx = await setupTest();

    ctx.model.addReplies({ text: 'done' });

    const toolSchema: z.ZodType<RequestTool> = z.lazy(() =>
      z.looseObject({
        type: z.string(),
        name: z.string().nullable().optional(),
        tools: toolSchema.array().optional(),
      }),
    );

    const itemSchema = z.looseObject({
      type: z.string(),
      role: z.string().optional(),
      content: z.looseObject({ type: z.string(), text: z.string() }).array().optional(),
      tools: toolSchema.array().optional(),
    });

    const requestBodySchema = z.looseObject({
      tools: toolSchema.array().optional(),
      input: itemSchema.array(),
    });

    const turn = await ctx.runTurn({ tools: { ping: 'pong' } });

    const [first] = ctx.model.requests;

    invariant(first?.body, 'the scripted model received a request');

    const body = requestBodySchema.parse(first.body);

    // Each tool the model can call, as its namespaces, then its type and name.
    const listToolPaths = (tools: readonly RequestTool[], prefix = ''): string[] =>
      tools.flatMap((tool) =>
        tool.tools === undefined
          ? [`${prefix}${tool.type}:${tool.name ?? ''}`]
          : listToolPaths(tool.tools, `${prefix}${tool.name ?? tool.type}/`),
      );

    const messages = body.input
      .filter((item) => item.type === 'message')
      .map((item) => ({ role: item.role, texts: item.content?.map((part) => part.text) }));

    const counts = await ctx.readCounted(turn.frames);

    expect(turn.frames.at(-1)?.type).toBe('ended');

    // The first request holds the tools, the system prompt and the input and nothing else: any
    // other item would be an instruction that nixie did not send.
    expect(body.input.map((item) => item.type)).toStrictEqual(['message', 'message']);

    expect(listToolPaths(body.tools ?? [])).toStrictEqual([
      'function:list_mcp_resources',
      'function:list_mcp_resource_templates',
      'function:read_mcp_resource',
      'mcp__nixie/function:ping',
    ]);

    expect(messages).toStrictEqual([
      { role: 'developer', texts: ['SYSTEM PROMPT MARKER'] },
      { role: 'user', texts: ['USER INPUT MARKER'] },
    ]);

    expect(first.headers['authorization']).toBe(`Bearer ${ctx.secretValue}`);
    expect(counts.counted.tokens).toBe(counts.expected.tokens);
    expect(counts.counted.dollars).toBeCloseTo(counts.expected.dollars, 9);
  },
);

test.skipIf(!hasRelay)(
  'it runs a turn that calls a nixie tool through the real model gateway',
  async () => {
    const ctx = await setupTest();

    ctx.model.addReplies(
      { toolUse: { name: 'ping', namespace: 'mcp__nixie', input: {} } },
      { text: 'done' },
    );

    const turn = await ctx.runTurn({ tools: { ping: 'pong' } });
    const counts = await ctx.readCounted(turn.frames);

    const outputs = ctx.readRequestText(1);

    expect(turn.frames.filter((frame) => frame.type === 'call')).toHaveLength(2);
    expect(turn.frames.at(-1)).toMatchObject({ type: 'ended', outcome: 'finished' });
    expect(outputs).toInclude('function_call_output');
    expect(outputs).toInclude('pong');
    expect(counts.counted.tokens).toBe(counts.expected.tokens);
    expect(counts.counted.dollars).toBeCloseTo(counts.expected.dollars, 9);
  },
);

test.skipIf(!hasRelay)('it fails a turn whose model call the API refuses with a 400', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ failure: { status: 400, message: 'the request is refused' } });

  const turn = await ctx.runTurn({ tools: { ping: 'pong' } });
  const counted = await ctx.gateway.readCount();

  expect(turn.frames.filter((frame) => frame.type === 'call')).toHaveLength(0);
  expect(turn.frames.at(-1)).toMatchObject({ type: 'failed', reason: 'model_api' });
  expect(counted.tokens).toBe(0);
});

test.skipIf(!hasRelay)('it retries a model call that the API answers with a 500', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ failure: { status: 500, message: 'broken' } }, { text: 'done' });

  const turn = await ctx.runTurn({ tools: { ping: 'pong' } });
  const counts = await ctx.readCounted(turn.frames);

  expect(turn.frames.filter((frame) => frame.type === 'call')).toHaveLength(1);
  expect(turn.frames.at(-1)).toMatchObject({ type: 'ended', outcome: 'finished' });
  expect(counts.counted.tokens).toBe(counts.expected.tokens);
  expect(counts.counted.dollars).toBeCloseTo(counts.expected.dollars, 9);
});

test.skipIf(!hasRelay)('it fails a turn whose required tool server is down', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'done' });

  const turn = await ctx.runTurn({});
  const counted = await ctx.gateway.readCount();

  expect(turn.frames.filter((frame) => frame.type === 'call')).toHaveLength(0);
  expect(turn.frames.at(-1)).toMatchObject({ type: 'failed', reason: 'tools_not_connected' });
  expect(counted.tokens).toBe(0);
});

test.skipIf(!hasRelay)(
  'it compacts the context inside one long turn and counts every call',
  async () => {
    const ctx = await setupTest();

    // a total past the automatic compaction trigger of the catalog's 272,000-token window
    const longContext = { input_tokens: 250_000, output_tokens: 20 };

    ctx.model.addReplies(
      {
        toolUse: { name: 'ping', namespace: 'mcp__nixie', input: {} },
        responsesUsage: longContext,
      },
      {
        text: 'SUMMARY OF THE WORK',
        when: isCompactionRequest,
      },
      { text: 'done' },
    );

    const turn = await ctx.runTurn({ tools: { ping: 'pong' } });
    const counts = await ctx.readCounted(turn.frames);

    const compactions = ctx.model.requests.filter((request) =>
      isCompactionRequest(request.body ?? {}),
    );

    expect(compactions).toHaveLength(1);
    expect(turn.frames.at(-1)).toMatchObject({ type: 'ended', outcome: 'finished' });
    expect(counts.counted.tokens).toBe(counts.expected.tokens);
    expect(counts.counted.dollars).toBeCloseTo(counts.expected.dollars, 9);
  },
);

test.skipIf(!hasRelay)('it passes a recall result of the page limit whole', async () => {
  const ctx = await setupTest();

  const result = buildRecallResult(recallPageLimitBytes);
  const lastBytes = result.slice(-100);

  ctx.model.addReplies(
    { toolUse: { name: 'recall', namespace: 'mcp__nixie', input: {} } },
    { text: 'done' },
  );

  const turn = await ctx.runTurn({ tools: { recall: result } });
  const counts = await ctx.readCounted(turn.frames);

  const second = ctx.readRequestText(1);

  expect(Buffer.byteLength(result)).toBe(recallPageLimitBytes);
  expect(turn.frames.at(-1)).toMatchObject({ type: 'ended', outcome: 'finished' });
  expect(second).toInclude(JSON.stringify(lastBytes).slice(1, -1));
  expect(counts.counted.tokens).toBe(counts.expected.tokens);
});

test.skipIf(!hasRelay)(
  'it keeps the capture tag segment between the route and the API path',
  async () => {
    const ctx = await setupTest();
    const recipient = await createSpoolRecipient();

    const captureID = crypto.randomUUID();
    const tag = encodeCaptureTag({ captureID, sealTo: recipient.sealTo });

    ctx.model.addReplies({ text: 'done' });

    const turn = await ctx.runTurn({ baseURLSegment: `/~in.${tag}`, tools: { ping: 'pong' } });
    const counts = await ctx.readCounted(turn.frames);
    const names = await readdir(ctx.gateway.spoolDir);

    const kept = names.filter((name) => parseSpoolFileName(name)?.kind === 'cap');

    const file = await readFile(join(ctx.gateway.spoolDir, kept[0] ?? ''));
    const opened = await openSpoolFile(new Uint8Array(file), recipient.privateKey);

    expect(turn.frames.at(-1)).toMatchObject({ type: 'ended', outcome: 'finished' });
    expect(ctx.model.requests.map((request) => request.path)).toStrictEqual(['/v1/responses']);
    expect(counts.counted.tokens).toBe(counts.expected.tokens);
    expect(kept).toHaveLength(1);
    expect(new TextDecoder().decode(opened?.body)).toInclude('USER INPUT MARKER');
  },
);

test.skipIf(!hasRelay)(
  'it runs the largest turn, a page-limit result and a compaction, with no out-of-memory kill',
  async () => {
    const ctx = await setupTest();

    const result = buildRecallResult(recallPageLimitBytes);

    ctx.model.addReplies(
      { toolUse: { name: 'recall', namespace: 'mcp__nixie', input: {} } },
      {
        toolUse: { name: 'ping', namespace: 'mcp__nixie', input: {} },
        responsesUsage: { input_tokens: 250_000, output_tokens: 20 },
      },
      {
        text: 'SUMMARY OF THE WORK',
        when: isCompactionRequest,
      },
      { text: 'done' },
    );

    const memoryMiB = Number(
      process.env['NIXIE_IMP_TEST_CODEX_MEMORY_MIB'] ?? sandboxSizes.codexTask.memoryMiB,
    );

    const turn = await ctx.runTurn({ tools: { recall: result, ping: 'pong' }, memoryMiB });
    const counts = await ctx.readCounted(turn.frames);

    const probeScript = String.raw`echo "oom_kill=$(awk '/^oom_kill/{print $2}' /proc/vmstat) peak=$(cat /sys/fs/cgroup/memory.peak 2>/dev/null) events=$(tr '\n' ' ' </sys/fs/cgroup/memory.events 2>/dev/null) memtotal=$(awk '/MemTotal/{print $2}' /proc/meminfo)"`;

    const probe = await turn.sandbox.exec({
      argv: ['sh', '-c', probeScript],
      env: {},
    });

    const line = new TextDecoder().decode(probe.stdout.bytes).trim();

    console.log(`codexTask probe at ${String(memoryMiB)} MiB: ${line}`);

    expect(turn.frames.at(-1)).toMatchObject({ type: 'ended' });
    expect(counts.counted.tokens).toBe(counts.expected.tokens);
    expect(line).toStartWith('oom_kill=0 ');
    expect(line).not.toMatch(/oom_kill [1-9]/u);
  },
);
