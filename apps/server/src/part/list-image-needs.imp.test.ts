import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindHarness } from '@heynixie/models';
import { buildMockCodexProfile } from '@heynixie/models/test-utils';
import type { GrantSpec } from '@heynixie/sandbox';
import { buildSandboxSpec, sandboxSizes } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { startScriptedModel } from '@heynixie/testing';
import {
  decodeTurnFrame,
  encodeHostFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';
import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';
import { z } from 'zod';

// These tests need a real impd on a host with /dev/kvm and the codex image built into it.
// docs/runbooks/imp-isolation-tests.md names the variables that turn them on.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '') !== '';

// The turn test also needs the name that the imp reaches the machine running this test by: the
// scripted model listens on loopback here, and the broker on the impd host dials that name.
const hasModelHost = hasImpHost && (process.env['NIXIE_IMP_TEST_CODEX_MODEL_HOST'] ?? '') !== '';

async function setupTest() {
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

  const image = process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '';

  const createSandbox = async (modelGrant?: GrantSpec) => {
    const sandbox = await adapter.create(
      buildSandboxSpec({
        kind: 'worker',
        image,
        owner: 'codex_turn_check',
        limits: sandboxSizes.codexTask,
        ...(modelGrant === undefined ? {} : { modelGrant }),
      }),
    );

    stack.defer(() => sandbox.destroy());

    return sandbox;
  };

  // Serves one tool over MCP on the socket that the sandbox's tool route reaches.
  const startToolServer = (token: string) => {
    const handler = createMcpHandler(() => {
      // oxlint-disable-next-line typescript/no-deprecated -- the Server class that nixie's tool endpoint serves
      const server = new Server(
        { name: 'nixie', version: '0.0.0' },
        { capabilities: { tools: { listChanged: true } } },
      );

      server.setRequestHandler('tools/list', () => ({
        tools: [{ name: 'ping', description: 'Answers pong.', inputSchema: { type: 'object' } }],
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

  return { stack, port, startToolServer, createSandbox };
}

test.skipIf(!hasImpHost)('it runs the pinned CLI in a codex sandbox on an imp host', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.createSandbox();
  const result = await sandbox.exec({ argv: ['codex', '--version'], env: {} });

  expect(new TextDecoder().decode(result.stdout.bytes).trim()).toBe('codex-cli 0.166.0');
});

test.skipIf(!hasModelHost)(
  'it gives the model only the 3 resource tools and nixie tools, and the secret as a bearer header',
  async () => {
    const ctx = await setupTest();

    const modelHost = process.env['NIXIE_IMP_TEST_CODEX_MODEL_HOST'] ?? '';
    const secretValue = `nixie-test-${crypto.randomUUID()}`;
    const secretName = `nixie-test-${crypto.randomUUID().slice(0, 8)}`;
    const toolToken = crypto.randomUUID();
    const model = startScriptedModel();

    onTestFinished(() => model.stop());

    model.addReplies({ text: 'done' });
    ctx.startToolServer(toolToken);

    const harness = bindHarness(
      buildMockCodexProfile({
        baseURL: `http://${modelHost}:${new URL(model.url).port}/v1`,
        model: 'house-model-1',
      }),
    );

    const held = await ctx.port.readSecretHosts(secretName);

    expect(held).toBeNull();

    await ctx.port.addSecret({
      name: secretName,
      value: secretValue,
      host: modelHost,
      header: 'authorization',
      scheme: 'bearer',
    });

    onTestFinished(() => ctx.port.removeSecret(secretName));

    const sandbox = await ctx.createSandbox(
      harness.buildGrant({ name: secretName, value: null, host: modelHost, header: 'bearer' }),
    );

    const route = await sandbox.toolRoute();

    invariant(route !== null, 'a worker sandbox has a tool route');

    const stream = await sandbox.spawn({
      argv: ['bun', '--no-install', '/app/codex/main.js'],
      env: { HOME: '/home/nixie' },
      maxMessageBytes: turnFrameLimitBytes,
    });

    onTestFinished(() => stream.stop());

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

    const frames = [];

    for await (const message of stream.messages) {
      const frame = decodeTurnFrame(guestFrameSchema, message);

      frames.push(frame.type);

      if (frame.type === 'ended' || frame.type === 'failed') {
        break;
      }
    }

    const [first] = model.requests;

    invariant(first?.body, 'the scripted model received a request');

    // The CLI sends no top-level tools: every tool reaches the model inside the additional_tools
    // input item, as a namespace of tools. Every tool the model can call is a leaf of that tree.
    const toolSchema: z.ZodType<RequestTool> = z.lazy(() =>
      z.looseObject({
        type: z.string(),
        name: z.string().nullable().optional(),
        tools: toolSchema.array().optional(),
      }),
    );

    const inputItemSchema = z.looseObject({
      type: z.string(),
      role: z.string().optional(),
      content: z.looseObject({ type: z.string(), text: z.string() }).array().optional(),
      tools: toolSchema.array().optional(),
    });

    const body = z
      .looseObject({ tools: toolSchema.array().optional(), input: inputItemSchema.array() })
      .parse(first.body);

    // Each tool the model can call, as its namespaces, then its type and name.
    const listToolPaths = (tools: readonly RequestTool[], prefix = ''): string[] =>
      tools.flatMap((tool) =>
        tool.tools === undefined
          ? [`${prefix}${tool.type}:${tool.name ?? ''}`]
          : listToolPaths(tool.tools, `${prefix}${tool.name ?? tool.type}/`),
      );

    const additional = body.input.filter((item) => item.type === 'additional_tools');

    const messages = body.input
      .filter((item) => item.type === 'message')
      .map((item) => ({ role: item.role, texts: item.content?.map((part) => part.text) }));

    expect(frames).toContain('ended');
    expect(body.tools ?? []).toStrictEqual([]);

    // The first request holds the tools, the system prompt and the input and nothing else: any
    // other item would be an instruction that nixie did not send.
    expect(body.input.map((item) => item.type)).toStrictEqual([
      'additional_tools',
      'message',
      'message',
    ]);

    expect(additional.flatMap((item) => listToolPaths(item.tools ?? []))).toStrictEqual([
      'functions/function:list_mcp_resources',
      'functions/function:list_mcp_resource_templates',
      'functions/function:read_mcp_resource',
      'mcp__nixie/function:ping',
    ]);

    expect(messages).toStrictEqual([
      { role: 'developer', texts: ['SYSTEM PROMPT MARKER'] },
      { role: 'user', texts: ['USER INPUT MARKER'] },
    ]);

    expect(first.headers['authorization']).toBe(`Bearer ${secretValue}`);
  },
);

interface RequestTool {
  readonly type: string;
  readonly name?: string | null | undefined;
  readonly tools?: readonly RequestTool[] | undefined;
}
