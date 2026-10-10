// A mock MCP server over stdio for agent evals. It keeps its state in MOCK_DIR so that a fresh
// process per turn (as with `codex exec resume`) sees the same memory and call counts.
// MOCK_FAIL="calendar_create:1,reminder_create:2" fails the 1st and 2nd call of those tools.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

interface Memory {
  fact: string;
  id: string;
  source?: string;
}

interface State {
  counts: Record<string, number>;
  memory: Memory[];
  nextId: number;
}

interface Tool {
  description: string;
  inputSchema: object;
  name: string;
  run: (args: Record<string, string>, state: State) => string;
}

interface Call {
  args: Record<string, string>;
  count: number;
  name: string;
  state: State;
}

interface ToolResult {
  isError: boolean;
  text: string;
}

interface Request {
  id?: number | string;
  method: string;
  params?: { arguments?: Record<string, string>; name?: string; protocolVersion?: string };
}

function readArg(args: Record<string, string>, key: string): string {
  return String(args[key] ?? '');
}

const TOOLS: Tool[] = [
    {
      description: "Search the owner's long-term memory. Returns matching entries with their ids.",
      inputSchema: {
        properties: { query: { type: 'string' } },
        required: ['query'],
        type: 'object',
      },
      name: 'memory_search',
      run: (args, state) => {
        const keywords = readArg(args, 'query').toLowerCase().split(/\W+/u).filter(Boolean),
          matches = state.memory.filter((entry) =>
            keywords.some((word) => entry.fact.toLowerCase().includes(word)),
          );
        return matches.length > 0
          ? matches.map((entry) => `${entry.id}: ${entry.fact}`).join('\n')
          : 'No matches.';
      },
    },
    {
      description:
        "Save one fact to the owner's long-term memory. Use one call per fact. `source` says where the fact came from.",
      inputSchema: {
        properties: {
          evidence: { description: 'Optional exact quote supporting the fact.', type: 'string' },
          fact: { type: 'string' },
          source: { enum: ['owner_said', 'assistant_suggested', 'inferred'], type: 'string' },
        },
        required: ['fact', 'source'],
        type: 'object',
      },
      name: 'memory_write',
      run: (args, state) => {
        const id = `m${state.nextId}`;
        state.nextId += 1;
        state.memory.push({ fact: readArg(args, 'fact'), id, source: readArg(args, 'source') });
        return `Saved as ${id}.`;
      },
    },
    {
      description:
        'Replace the text of an existing memory entry, for example when it is out of date.',
      inputSchema: {
        properties: { fact: { type: 'string' }, id: { type: 'string' } },
        required: ['id', 'fact'],
        type: 'object',
      },
      name: 'memory_update',
      run: (args, state) => {
        const entry = state.memory.find((item) => item.id === readArg(args, 'id'));
        if (!entry) {
          throw new Error(`No memory entry with id ${readArg(args, 'id')}.`);
        }
        entry.fact = readArg(args, 'fact');
        return `Updated ${entry.id}.`;
      },
    },
    {
      description:
        'Create a reminder that notifies the owner at a time. `time` is ISO 8601 local time.',
      inputSchema: {
        properties: { text: { type: 'string' }, time: { type: 'string' } },
        required: ['time', 'text'],
        type: 'object',
      },
      name: 'reminder_create',
      run: (args) => `Reminder set for ${readArg(args, 'time')}: ${readArg(args, 'text')}`,
    },
    {
      description: "List the owner's calendar events on a date (YYYY-MM-DD).",
      inputSchema: { properties: { date: { type: 'string' } }, required: ['date'], type: 'object' },
      name: 'calendar_list',
      run: (args) => (calendar[readArg(args, 'date')] ?? ['No events.']).join('\n'),
    },
    {
      description:
        "Add an event to the owner's calendar. `start` and `end` are ISO 8601 local times.",
      inputSchema: {
        properties: {
          end: { type: 'string' },
          start: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['title', 'start', 'end'],
        type: 'object',
      },
      name: 'calendar_create',
      run: (args) =>
        `Event created: ${readArg(args, 'title')}, ${readArg(args, 'start')} to ${readArg(args, 'end')}`,
    },
    {
      description: 'Save a message as a draft for the owner to review. It does not send anything.',
      inputSchema: {
        properties: { body: { type: 'string' }, to: { type: 'string' } },
        required: ['to', 'body'],
        type: 'object',
      },
      name: 'message_draft',
      run: (args) => `Draft saved for ${readArg(args, 'to')}. Not sent.`,
    },
    {
      description: 'Search the web. Returns short result snippets.',
      inputSchema: {
        properties: { query: { type: 'string' } },
        required: ['query'],
        type: 'object',
      },
      name: 'web_search',
      run: () => searchResults.default ?? '',
    },
  ],
  calendar: Record<string, string[]> = {
    '2026-10-09': ['09:00-09:30 Team standup', '14:00-15:00 Dentist, 12 Harley Street'],
    '2026-10-10': ["19:00-23:00 Sam's birthday drinks, The Crown"],
    '2026-10-12': ['09:00-10:00 1:1 with manager (Priya)'],
  },
  dir = process.env.MOCK_DIR ?? '.',
  failures = new Map(
    (process.env.MOCK_FAIL ?? '')
      .split(',')
      .filter(Boolean)
      .map((entry) => {
        const [name = '', count = '0'] = entry.split(':');
        return [`${name}:${count}`, true] as const;
      }),
  ),
  searchResults: Record<string, string> = {
    default:
      '1. The Crown, Islington: pub, open until 23:00 Fri-Sat. 2. The Crown, Soho: closed for refurbishment until November.',
  };

function readSeed(): Memory[] {
  const seed = join(dir, 'seed.json');
  return existsSync(seed) ? (JSON.parse(readFileSync(seed, 'utf8')) as Memory[]) : [];
}

function buildSeedState(): State {
  const memory = readSeed();
  return { counts: {}, memory, nextId: memory.length + 1 };
}

function readState(): State {
  const path = join(dir, 'state.json');
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8')) as State;
  }
  return buildSeedState();
}

function runTool(tool: Tool | undefined, call: Call): ToolResult {
  if (!tool) {
    return { isError: true, text: `Unknown tool ${call.name}.` };
  }
  if (failures.has(`${call.name}:${call.count}`)) {
    return { isError: true, text: 'Error: the service timed out. Nothing was saved.' };
  }
  try {
    return { isError: false, text: tool.run(call.args, call.state) };
  } catch (error) {
    return { isError: true, text: `Error: ${(error as Error).message}` };
  }
}

function countCall(state: State, name: string): number {
  const next = (state.counts[name] ?? 0) + 1;
  state.counts[name] = next;
  return next;
}

function runCall(name: string, args: Record<string, string>): ToolResult {
  const state = readState(),
    tally = countCall(state, name),
    tool = TOOLS.find((item) => item.name === name),
    toolResult = runTool(tool, { args, count: tally, name, state });
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2));
  appendFileSync(
    join(dir, 'calls.jsonl'),
    `${JSON.stringify({ args, name, result: toolResult, time: Date.now() })}\n`,
  );
  return toolResult;
}

function buildResult(request: Request): object | undefined {
  switch (request.method) {
    case 'initialize': {
      return {
        capabilities: { tools: {} },
        protocolVersion: request.params?.protocolVersion ?? '2025-06-18',
        serverInfo: { name: 'mock', version: '0.0.0' },
      };
    }
    case 'tools/list': {
      return {
        tools: TOOLS.map((tool) => ({
          _meta: { 'anthropic/alwaysLoad': true },
          description: tool.description,
          inputSchema: tool.inputSchema,
          name: tool.name,
        })),
      };
    }
    case 'tools/call': {
      const result = runCall(request.params?.name ?? '', request.params?.arguments ?? {});
      return { content: [{ text: result.text, type: 'text' }], isError: result.isError };
    }
    case 'ping': {
      return {};
    }
    default: {
      return undefined;
    }
  }
}

function buildReply(request: Request): object {
  const result = buildResult(request);
  return result
    ? { id: request.id, jsonrpc: '2.0', result }
    : {
        error: { code: -32_601, message: `Unknown method ${request.method}` },
        id: request.id,
        jsonrpc: '2.0',
      };
}

function handleLine(line: string): void {
  if (!line.trim()) {
    return;
  }
  const request = JSON.parse(line) as Request;
  if (request.id !== undefined) {
    process.stdout.write(`${JSON.stringify(buildReply(request))}\n`);
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  handleLine(line);
}
