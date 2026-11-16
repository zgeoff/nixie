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

    // The CLI sends its tools as function and custom items, the nixie tools inside a namespace item
    // of an additional_tools input item, so a scan of the request's JSON reads them all.
    const toolNames = [
      ...JSON.stringify(first.body).matchAll(
        /"type":"(?:function|custom)","name":"(?<name>[^"]+)"/gu,
      ),
    ].map((match) => match.groups?.['name']);

    expect(frames).toContain('ended');

    expect(toolNames).toIncludeSameMembers([
      'list_mcp_resource_templates',
      'list_mcp_resources',
      'read_mcp_resource',
      'ping',
    ]);

    expect(JSON.stringify(first.body.input)).toContain('SYSTEM PROMPT MARKER');
    expect(JSON.stringify(first.body.input)).toContain('USER INPUT MARKER');
    expect(first.headers['authorization']).toBe(`Bearer ${secretValue}`);
  },
);
