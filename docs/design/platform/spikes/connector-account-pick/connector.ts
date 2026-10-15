// A mock connector MCP server over stdio for the account-pick eval. It lists one connector tool
// whose `connection` argument names an account in the way that ACCOUNT_ARM picks, and appends every
// call to ACCOUNT_LOG. A value outside the allowed set fails the input check, and the error lists
// the choices, as the connector design describes.
// Env: ACCOUNT_CASES (cases.json), ACCOUNT_SET (a set name), ACCOUNT_ARM, ACCOUNT_LOG.
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

interface Connection {
  account: string | null;
  id: string;
  label: string;
}

interface ConnectionSet {
  connections: Connection[];
  tool: string;
}

interface Request {
  id?: number | string;
  method: string;
  params?: { arguments?: Record<string, unknown>; name?: string; protocolVersion?: string };
}

const ARMS = ['id-label', 'id-only', 'id-tool-desc', 'label'] as const;

type Arm = (typeof ARMS)[number];

const TOOL_FIELDS: Record<string, { description: string; fields: Record<string, string> }> = {
    calendar_create: {
      description: 'Create an event on a calendar.',
      fields: { start: 'ISO 8601 local start time.', title: 'Event title.' },
    },
    files_search: {
      description: 'Search the files in a Drive.',
      fields: { query: 'Search text.' },
    },
    mail_draft: {
      description: 'Save an email draft in a mailbox. The owner reviews drafts before they go out.',
      fields: { body: 'Plain-text body.', subject: 'Subject line.', to: 'Recipient address.' },
    },
    web_search: { description: 'Search the web.', fields: { query: 'Search text.' } },
  },
  arm = pickArm(process.env['ACCOUNT_ARM'] ?? ''),
  set = loadSet(),
  log = process.env['ACCOUNT_LOG'] ?? '';

function pickArm(value: string): Arm {
  const found = ARMS.find((name) => name === value);
  if (!found) {
    throw new Error(`ACCOUNT_ARM must be one of ${ARMS.join(', ')}`);
  }
  return found;
}

function loadSet(): ConnectionSet {
  const cases = JSON.parse(readFileSync(process.env['ACCOUNT_CASES'] ?? '', 'utf8')) as {
      sets: Record<string, ConnectionSet>;
    },
    found = cases.sets[process.env['ACCOUNT_SET'] ?? ''];
  if (!found) {
    throw new Error('ACCOUNT_SET names no set in ACCOUNT_CASES');
  }
  return found;
}

function formatConnection(connection: Connection): string {
  return connection.account === null || connection.account === connection.label
    ? connection.label
    : `${connection.label}: ${connection.account}`;
}

function buildConnectionSchema(): object {
  const { connections } = set;
  switch (arm) {
    case 'id-label': {
      return {
        oneOf: connections.map((item) => ({ const: item.id, description: formatConnection(item) })),
      };
    }
    case 'label': {
      return { enum: connections.map((item) => item.label), type: 'string' };
    }
    case 'id-only':
    case 'id-tool-desc': {
      return { enum: connections.map((item) => item.id), type: 'string' };
    }
  }
}

function buildToolDescription(): string {
  const base = TOOL_FIELDS[set.tool]?.description ?? '';
  if (arm !== 'id-tool-desc') {
    return base;
  }
  const lines = set.connections.map((item) => `- ${item.id}: ${formatConnection(item)}`);
  return `${base}\n\nConnections, by the ID that \`connection\` takes:\n${lines.join('\n')}`;
}

function buildTool(): object {
  const fields = TOOL_FIELDS[set.tool]?.fields ?? {},
    properties: Record<string, object> = { connection: buildConnectionSchema() };
  for (const [name, description] of Object.entries(fields)) {
    properties[name] = { description, type: 'string' };
  }
  return {
    description: buildToolDescription(),
    inputSchema: {
      properties,
      required: ['connection', ...Object.keys(fields)],
      type: 'object',
    },
    name: set.tool,
  };
}

function getAllowedValues(): string[] {
  return set.connections.map((item) => (arm === 'label' ? item.label : item.id));
}

function buildCallResult(args: Record<string, unknown>): { isError: boolean; text: string } {
  const value = String(args['connection'] ?? ''),
    allowed = getAllowedValues();
  if (!allowed.includes(value)) {
    const choices = set.connections.map((item, index) =>
      arm === 'id-only' ? `- ${allowed[index]}` : `- ${allowed[index]} (${formatConnection(item)})`,
    );
    return {
      isError: true,
      text: `Input check failed: \`connection\` must be one of:\n${choices.join('\n')}`,
    };
  }
  return { isError: false, text: set.tool === 'mail_draft' ? 'Draft saved.' : 'Done.' };
}

function sendMessage(message: object): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function runRequest(request: Request): void {
  if (request.id === undefined) {
    return;
  }
  switch (request.method) {
    case 'initialize': {
      sendMessage({
        id: request.id,
        jsonrpc: '2.0',
        result: {
          capabilities: { tools: {} },
          protocolVersion: request.params?.protocolVersion ?? '2025-06-18',
          serverInfo: { name: 'account-connector', version: '0.0.0' },
        },
      });
      return;
    }
    case 'tools/list': {
      sendMessage({ id: request.id, jsonrpc: '2.0', result: { tools: [buildTool()] } });
      return;
    }
    case 'tools/call': {
      const args = request.params?.arguments ?? {},
        result = buildCallResult(args);
      appendFileSync(
        log,
        `${JSON.stringify({ args, error: result.isError, tool: request.params?.name })}\n`,
      );
      sendMessage({
        id: request.id,
        jsonrpc: '2.0',
        result: { content: [{ text: result.text, type: 'text' }], isError: result.isError },
      });
      return;
    }
    default: {
      sendMessage({ id: request.id, jsonrpc: '2.0', result: {} });
    }
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim()) {
    runRequest(JSON.parse(line) as Request);
  }
}
