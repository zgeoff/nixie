import { mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { SDKResultMessage, SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import type { JSONObject } from '@heynixie/log';
import { buildWriterTools, createWriterStaging } from '@heynixie/memory';
import type { ToolDefinition, ToolRegistry } from '@heynixie/tools';
import { buildToolRegistry } from '@heynixie/tools';
import { z } from 'zod';
import type { WriterEvalInput, WriterToolSpec } from '../test-utils/build-writer-eval-input';
import { buildWriterEvalInput } from '../test-utils/build-writer-eval-input';
import type { WriterCase } from '../test-utils/load-writer-cases';
import { loadWriterCases } from '../test-utils/load-writer-cases';
import type { WriterCall, WriterReport } from '../test-utils/load-writer-report';

const model = parseArgs({ options: { model: { type: 'string', default: 'claude-haiku-5-5' } } })
  .values.model;

const effort = 'low';
const repeats = 3;
const concurrency = 2;
const maxTurns = 10;

interface PlannedRun {
  readonly writerCase: WriterCase;
  readonly repeat: number;
}

const emptyStore = { recall: () => Promise.resolve({ items: [], next: null }) };
const jsonObject = z.record(z.string(), z.json()).transform((value): JSONObject => value);
const directory = import.meta.dir;

const cases = await loadWriterCases(join(directory, 'cases.json'));
const home = await mkdtemp(join(tmpdir(), 'nixie-writer-eval-'));

const planned = cases.cases.flatMap((writerCase) =>
  Array.from({ length: repeats }, (_, repeat) => ({ writerCase, repeat })),
);

const calls = await runPlannedRuns(planned);

const report: WriterReport = { model, effort, repeats, calls };

await Bun.write(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

async function runPlannedRuns(all: readonly PlannedRun[]): Promise<readonly WriterCall[]> {
  const queue = [...all];
  const done: WriterCall[] = [];

  const runWorker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const call = await runCase(next);

      done.push(call);
      process.stdout.write(`${String(done.length)}/${String(all.length)}\r`);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, runWorker));

  return done.toSorted(
    (left, right) => left.case.localeCompare(right.case) || left.repeat - right.repeat,
  );
}

async function runCase(run: PlannedRun): Promise<WriterCall> {
  const staging = createWriterStaging();
  const tools = buildWriterTools(emptyStore, staging, 5);

  const input = buildWriterEvalInput(
    cases,
    run.writerCase,
    tools.map((tool) => toToolSpec(tool)),
  );

  const staged = staging.open({ sources: input.sources, shown: input.shown });

  const session = await runSession(input, tools);

  const writes = staged.close();

  return {
    case: run.writerCase.id,
    repeat: run.repeat,
    input: input.hash,
    writes: writes.map((write) => ({
      op: write.op,
      subject: write.op === 'remember' ? write.subject : null,
      itemID: write.target?.itemID ?? null,
      text: write.op === 'remember' ? write.text : null,
    })),
    flags: staged.readFlags().map((flag) => flag.text),
    failure: session.failure,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
  };
}

function toToolSpec(tool: ToolDefinition): WriterToolSpec {
  return { name: tool.name, description: tool.description, input: tool.input };
}

interface SessionResult {
  readonly failure: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

async function runSession(
  input: WriterEvalInput,
  tools: readonly ToolDefinition[],
): Promise<SessionResult> {
  const registry = buildToolRegistry(tools);

  const server = createSdkMcpServer({
    name: 'nixie',
    tools: tools.map((tool) => buildSDKTool(registry, tool)),
  });

  const session = query({
    prompt: input.prompt,
    options: {
      model,
      tools: [],
      allowedTools: ['mcp__nixie'],
      maxTurns,
      thinking: { type: 'adaptive', display: 'summarized' },
      permissionMode: 'dontAsk',
      settingSources: [],
      strictMcpConfig: true,
      skills: [],
      verbatimPrompts: true,
      settings: {
        disableBundledSkills: true,
        autoMemoryEnabled: false,
        autoDreamEnabled: false,
        autoCompactEnabled: false,
        precomputeCompactionEnabled: false,
        idleCompaction: false,
      },
      mcpServers: { nixie: server },
      systemPrompt: { type: 'custom', prompt: input.systemPrompt, snapshot: false },
      cwd: home,
      env: {
        ...readProxyEnv(),
        HOME: home,
        CLAUDE_CONFIG_DIR: process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'),
        PATH: process.env['PATH'] ?? '',
        ANTHROPIC_MODEL: model,
        ANTHROPIC_SMALL_FAST_MODEL: model,
        CLAUDE_CODE_EFFORT_LEVEL: effort,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
        DISABLE_COMPACT: '1',
        DISABLE_AUTOUPDATER: '1',
      },
    },
  });

  try {
    for await (const message of session) {
      if (message.type === 'result') {
        return {
          failure: findResultFailure(message),
          inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
          outputTokens: message.usage.output_tokens,
        };
      }
    }
  } catch (error) {
    return { failure: String(error), inputTokens: 0, outputTokens: 0 };
  } finally {
    session.close();
  }

  return { failure: 'the session ended with no result', inputTokens: 0, outputTokens: 0 };
}

// The SDK reports an API error that ends a turn as a success result whose text holds the error in
// place of the model's reply.
function findResultFailure(message: SDKResultMessage): string | null {
  if (message.subtype !== 'success') {
    return message.subtype;
  }

  return message.is_error ? `api error: ${message.result}` : null;
}

// The SDK takes a zod shape, so the shape comes from the tool's own JSON schema.
function buildSDKTool(registry: ToolRegistry, tool: ToolDefinition): SdkMcpToolDefinition {
  const schema = z.fromJSONSchema(tool.input);

  if (!(schema instanceof z.ZodObject)) {
    throw new TypeError(`the input of ${tool.name} is not an object schema`);
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: schema.shape,
    handler: async (args) => {
      const toolInput = jsonObject.parse(args);

      const check = registry.findTool(tool.name)?.parseInput(toolInput) ?? {
        isValid: false,
        errors: `no tool is named ${tool.name}`,
      };

      if (!check.isValid) {
        return toToolResult(check.errors, true);
      }

      const outcome = await tool.run(
        { callID: crypto.randomUUID(), tool: tool.name, input: toolInput, toolUseID: null },
        {
          run: {
            runID: 'eval',
            thread: 'memory-writer',
            tools: [],
            model: { model, profile: 'eval' },
          },
        },
      );

      return outcome.status === 'ok'
        ? toToolResult(JSON.stringify(outcome.result), false)
        : toToolResult(outcome.message, true);
    },
  };
}

function toToolResult(text: string, isError: boolean) {
  return { content: [{ type: 'text' as const, text }], isError };
}

// A host that reaches the API through an HTTPS proxy needs the proxy and its CA in the query too.
function readProxyEnv(): Record<string, string> {
  const names = [
    'HTTPS_PROXY',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
    'NODE_USE_ENV_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
  ];

  return Object.fromEntries(
    names.flatMap((key) => {
      const value = process.env[key];

      return value === undefined ? [] : [[key, value]];
    }),
  );
}
