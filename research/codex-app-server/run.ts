// Drives nixie-shaped turns through `codex app-server` against a mock MCP server and a stand-in for
// the counting proxy, and writes every message to runs/<run_name>/.
// Usage: OPENAI_API_KEY=<key> bun run.ts <run_name> <model>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { homedir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { type AppServer, startAppServer } from './start-app-server.ts';
import { type CountProxy, startCountProxy } from './start-count-proxy.ts';
import { startToolServer } from './start-tool-server.ts';

const codexVersion = 'codex-cli 0.166.0';
const slowToolMs = 8000;
const persona = 'You are a terse assistant. Read notes only through the find_note tool.';

// Codex reports these as they stream; the spike reads the completed items instead.
const quietNotifications = [
  'item/agentMessage/delta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/summaryPartAdded',
  'item/reasoning/textDelta',
];

interface Run {
  readonly env: Record<string, string>;
  readonly codexHome: string;
  readonly stateDir: string;
  readonly workDir: string;
  readonly model: string;
}

interface TurnRecord {
  readonly step: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly status: string;
  readonly reply: string;
  readonly toolCallItemIds: readonly string[];
  readonly tokenUsageEvents: number;
  readonly rawResponseEvents: number;
  readonly proxyCalls: number;
}

const threadResult = z.object({ thread: z.object({ id: z.string() }) });
const turnResult = z.object({ turn: z.object({ id: z.string() }) });
const turnCompleted = z.object({
  turn: z.object({ id: z.string(), status: z.string() }),
});
const itemEvent = z.object({
  turnId: z.string(),
  item: z.object({ type: z.string(), id: z.string(), text: z.string().optional() }),
});
const turnEvent = z.object({ turnId: z.string() });

interface RunArgs {
  readonly name: string;
  readonly model: string;
  readonly apiKey: string;
}

// the facts about this machine that the logs must not hold
interface Host {
  readonly home: string;
  readonly name: string;
}

async function run({ name, model, apiKey }: RunArgs, host: Host): Promise<void> {
  const outDir = findChildDir(resolve(import.meta.dir, 'runs'), name);
  const stateDir = findChildDir(resolve(import.meta.dir, '.state'), name);

  if (!outDir || !stateDir) {
    throw new Error(`the run name ${JSON.stringify(name)} must be one plain folder name`);
  }
  await checkVersion();
  rmSync(stateDir, { force: true, recursive: true });
  for (const dir of ['codex', 'home', 'work']) {
    mkdirSync(join(stateDir, dir), { recursive: true });
  }
  mkdirSync(outDir, { recursive: true });

  // Codex puts the git remote and path of the repo around its working directory in each tool
  // call's `_meta`; a repo of its own keeps this checkout's out of the logs
  await Bun.$`git init -q`.cwd(join(stateDir, 'work'));
  const proxy = startCountProxy('https://api.openai.com');
  const tools = startToolServer(slowToolMs);
  const codexHome = join(stateDir, 'codex');
  const mcpToken = crypto.randomUUID();
  const runState: Run = {
    env: {
      CODEX_HOME: codexHome,
      HOME: join(stateDir, 'home'),
      PATH: process.env.PATH ?? '',
      OPENAI_API_KEY: apiKey,
      NIXIE_TOKEN: mcpToken,
    },
    codexHome,
    stateDir,
    workDir: join(stateDir, 'work'),
    model,
  };
  const servers: Record<string, AppServer> = {};
  const turns: TurnRecord[] = [];

  try {
    writeConfig(runState, proxy.url, tools.url, false);
    servers['first-process'] = await openServer(runState);
    await runFirstProcess(runState, servers['first-process'], proxy, turns);
    await servers['first-process'].stop();

    servers['second-process'] = await openServer(runState);
    await runSecondProcess(runState, servers['second-process'], proxy, turns);
    await servers['second-process'].stop();

    writeConfig(runState, proxy.url, tools.url, true);
    servers['websocket-process'] = await openServer(runState);
    await runWebsocketCheck(runState, servers['websocket-process'], proxy, turns);
  } finally {
    await Promise.all(Object.values(servers).map((server) => server.stop()));
    await proxy.waitForCounts();
    await proxy.stop();
    await tools.stop();
    const write = (file: string, value: unknown): void => {
      writeFileSync(
        join(outDir, file),
        formatScrubbed(value, [
          [stateDir, '<state>'],
          [host.home, '<home>'],
          [host.name, '<host>'],
          [mcpToken, '<token>'],
        ]),
      );
    };

    write('turns.json', turns);
    write('proxy.json', proxy.calls);
    write('mcp.json', tools.requests);
    for (const [label, server] of Object.entries(servers)) {
      write(`rpc-${label}.json`, server.log);
    }
  }
}

function findChildDir(root: string, name: string): string | null {
  const dir = resolve(root, name);

  return dirname(dir) === root && dir !== root ? dir : null;
}

async function checkVersion(): Promise<void> {
  const version = (await Bun.$`codex --version`.text()).trim();

  if (version !== codexVersion) {
    throw new Error(`the spike pins ${codexVersion}; this host has ${version}`);
  }
}

function writeConfig(runState: Run, proxyURL: string, toolURL: string, websockets: boolean): void {
  writeFileSync(
    join(runState.codexHome, 'config.toml'),
    `model = ${JSON.stringify(runState.model)}
model_provider = "counted"
model_reasoning_effort = "low"
sandbox_mode = "read-only"
approval_policy = "never"
tool_output_token_limit = 4000
include_environment_context = false
include_permissions_instructions = false
include_apps_instructions = false
include_collaboration_mode_instructions = false
project_doc_max_bytes = 0
web_search = "disabled"

[model_providers.counted]
name = "counted"
base_url = "${proxyURL}/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
supports_websockets = ${websockets}

[mcp_servers.nixie]
url = "${toolURL}"
bearer_token_env_var = "NIXIE_TOKEN"
required = true
default_tools_approval_mode = "approve"

[features]
apps = false
browser_use = false
computer_use = false
goals = false
hooks = false
image_generation = false
multi_agent = false
plugins = false
shell_snapshot = false
shell_tool = false
skill_search = false
tool_suggest = false
unified_exec = false
view_image = false

[skills]
include_instructions = false

[skills.bundled]
enabled = false

[agents]
enabled = false
`,
  );
}

async function openServer(runState: Run): Promise<AppServer> {
  const server = startAppServer(runState.env, runState.workDir);

  await server.request('initialize', {
    clientInfo: { name: 'nixie-spike', title: null, version: '0.0.0' },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      optOutNotificationMethods: quietNotifications,
    },
  });
  server.notify('initialized');
  return server;
}

async function runFirstProcess(
  runState: Run,
  server: AppServer,
  proxy: CountProxy,
  turns: TurnRecord[],
): Promise<void> {
  await server.request('model/list', {});
  const started = threadResult.parse(
    await server.request('thread/start', {
      model: runState.model,
      cwd: runState.workDir,
      baseInstructions: persona,
    }),
  );
  const threadId = started.thread.id;
  const ask = (step: string, text: string, extra: object = {}): Promise<TurnRecord> =>
    runTurn(server, proxy,{ step, threadId, input: [buildText(text)], extra });

  turns.push(
    await ask(
      'tool turn',
      'Find the notes on garden and on boat, then give me both in one sentence.',
    ),
  );
  turns.push(
    await ask('structured output', 'Give the boat note as JSON.', {
      outputSchema: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
        additionalProperties: false,
      },
    }),
  );
  turns.push(
    await runTurn(server, proxy,{
      step: 'steer',
      threadId,
      input: [buildText('Find the note on slow and tell me what it says.')],
      extra: {},
      onToolCall: async (turnId) => {
        await server.request('turn/steer', {
          threadId,
          expectedTurnId: turnId,
          input: [buildText('Also end your reply with the word kiwi.')],
        });
      },
    }),
  );
  turns.push(
    await runTurn(server, proxy,{
      step: 'interrupt',
      threadId,
      input: [buildText('Find the note on slow and tell me what it says.')],
      extra: {},
      onToolCall: async (turnId) => {
        await server.request('turn/interrupt', { threadId, turnId });
      },
    }),
  );
  const imagePath = join(runState.workDir, 'square.png');

  writeFileSync(imagePath, buildSquarePNG());
  turns.push(
    await runTurn(server, proxy,{
      step: 'image',
      threadId,
      input: [
        buildText('What colour fills this image? Answer in one word.'),
        { type: 'localImage', path: imagePath },
      ],
      extra: {},
    }),
  );
  const compactStart = server.log.length;

  await server.request('thread/compact/start', { threadId });
  await server.waitFor('item/completed', compactStart, (params) => {
    const parsed = itemEvent.safeParse(params);
    return parsed.success && parsed.data.item.type === 'contextCompaction';
  });
}

async function runSecondProcess(
  runState: Run,
  server: AppServer,
  proxy: CountProxy,
  turns: TurnRecord[],
): Promise<void> {
  const [first] = turns;

  if (!first) {
    throw new Error('the first process recorded no turn');
  }
  await server.request('thread/resume', { threadId: first.threadId, model: runState.model });
  turns.push(
    await runTurn(server, proxy,{
      step: 'resume in a new process',
      threadId: first.threadId,
      input: [buildText('Which topics did you look up notes on before? Name only the topics.')],
      extra: {},
    }),
  );
  const forked = threadResult.parse(
    await server.request('thread/fork', {
      threadId: first.threadId,
      lastTurnId: first.turnId,
      model: runState.model,
    }),
  );

  turns.push(
    await runTurn(server, proxy,{
      step: 'fork after the first turn',
      threadId: forked.thread.id,
      input: [
        buildText(
          'List every message I have sent you in this conversation, word for word, one per line.',
        ),
      ],
      extra: {},
    }),
  );
}

async function runWebsocketCheck(
  runState: Run,
  server: AppServer,
  proxy: CountProxy,
  turns: TurnRecord[],
): Promise<void> {
  const started = threadResult.parse(
    await server.request('thread/start', {
      model: runState.model,
      cwd: runState.workDir,
      baseInstructions: persona,
    }),
  );

  turns.push(
    await runTurn(server, proxy,{
      step: 'supports_websockets = true',
      threadId: started.thread.id,
      input: [buildText('Say hello in two words.')],
      extra: {},
    }),
  );
}

interface TurnPlan {
  readonly step: string;
  readonly threadId: string;
  readonly input: readonly object[];
  readonly extra: object;

  // runs once the turn's first MCP tool call starts
  readonly onToolCall?: (turnId: string) => Promise<void>;
}

async function runTurn(
  server: AppServer,
  proxy: CountProxy,
  plan: TurnPlan,
): Promise<TurnRecord> {
  const logStart = server.log.length;
  await proxy.waitForCounts();
  const proxyStart = proxy.calls.length;
  const result = turnResult.parse(
    await server.request('turn/start', {
      threadId: plan.threadId,
      input: plan.input,
      ...plan.extra,
    }),
  );
  const turnId = result.turn.id;

  if (plan.onToolCall) {
    await server.waitFor('item/started', logStart, (params) => {
      const parsed = itemEvent.safeParse(params);
      return (
        parsed.success && parsed.data.turnId === turnId && parsed.data.item.type === 'mcpToolCall'
      );
    });
    await plan.onToolCall(turnId);
  }
  const completed = await server.waitFor('turn/completed', logStart, (params) => {
    const parsed = turnCompleted.safeParse(params);
    return parsed.success && parsed.data.turn.id === turnId;
  });
  const done = turnCompleted.parse(completed.params);

  await proxy.waitForCounts();
  const events = server.log.slice(logStart).flatMap((entry) => {
    const parsed = z.object({ method: z.string(), params: z.unknown() }).safeParse(entry);
    const forTurn = parsed.success && turnEvent.safeParse(parsed.data.params).data?.turnId === turnId;
    return parsed.success && forTurn ? [parsed.data] : [];
  });
  const items = events.flatMap((event) => {
    const parsed = itemEvent.safeParse(event.params);
    return event.method === 'item/completed' && parsed.success ? [parsed.data.item] : [];
  });

  console.log(`${plan.step}: ${done.turn.status}`);
  return {
    step: plan.step,
    threadId: plan.threadId,
    turnId,
    status: done.turn.status,
    reply: items
      .filter((item) => item.type === 'agentMessage')
      .map((item) => item.text ?? '')
      .join('\n'),
    toolCallItemIds: items.filter((item) => item.type === 'mcpToolCall').map((item) => item.id),
    tokenUsageEvents: events.filter((event) => event.method === 'thread/tokenUsage/updated').length,
    rawResponseEvents: events.filter((event) => event.method === 'rawResponse/completed').length,
    proxyCalls: proxy.calls.length - proxyStart,
  };
}

function buildText(text: string): object {
  return { type: 'text', text, text_elements: [] };
}

// A 16 by 16 PNG filled with pure red, built by hand so the spike carries no image file.
function buildSquarePNG(): Uint8Array {
  const size = 16;
  const row = [0, ...Array.from({ length: size }, () => [255, 0, 0]).flat()];
  const pixels = new Uint8Array(Array.from({ length: size }, () => row).flat());
  const header = new Uint8Array([0, 0, 0, size, 0, 0, 0, size, 8, 2, 0, 0, 0]);

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    buildChunk('IHDR', header),
    buildChunk('IDAT', deflateSync(pixels)),
    buildChunk('IEND', new Uint8Array()),
  ]);
}

function buildChunk(type: string, data: Uint8Array): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(Bun.hash.crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

// The logs go into the repo, so they hold no local path, host name or token.
function formatScrubbed(
  value: unknown,
  replacements: readonly (readonly [text: string, placeholder: string])[],
): string {
  const text = JSON.stringify(value, null, 2);

  return `${replacements.reduce((scrubbed, [from, to]) => scrubbed.replaceAll(from, to), text)}\n`;
}

function parseRunArgs(argv: string[], apiKey: string | undefined): RunArgs {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, options: {} });
  const [name, model] = positionals;

  if (positionals.length !== 2 || !name || !model || !apiKey) {
    throw new Error('usage: OPENAI_API_KEY=<key> bun run.ts <run_name> <model>');
  }
  return { name, model, apiKey };
}

await run(parseRunArgs(process.argv.slice(2), process.env.OPENAI_API_KEY), {
  home: homedir(),
  name: hostname(),
});
