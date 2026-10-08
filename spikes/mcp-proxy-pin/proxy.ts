// oxlint-disable one-var, max-statements -- spike code, each step kept in one readable sequence
// A minimal nixie proxy for one outside MCP server: it pins each tool by hash, requires an owner
// effect declaration, prefixes exposed names, and validates results against the pinned schema.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import type { Tool, jsonSchemaValidator } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/client/validators/ajv';

export type Trust = 'trusted' | 'untrusted';

export interface Declaration {
  destinations: string[];
  effects: string[];
}

interface PinnedTool {
  annotations?: unknown;
  description?: string;
  inputSchema: unknown;
  name: string;
  outputSchema?: unknown;
  title?: string;
}

interface Pin {
  hash: string;
  tool: PinnedTool;
}

export interface ToolDecision {
  exposedAs?: string;
  notice?: string;
  status: 'exposed' | 'removed' | 'stopped';
  tool: string;
  why?: string;
}

export interface CallOutcome {
  error?: string;
  source: 'outside content';
  structured?: unknown;
  text?: string;
}

export interface ProxyOptions {
  clientValidates: boolean;
  declarations: Record<string, Declaration>;
  env: Record<string, string>;
  pinsPath: string;
  script?: string;
  serverId: string;
  trust: Trust;
}

// Accept every result, so the proxy, not the client, judges structured content against its pin.
const passThrough: jsonSchemaValidator = {
  getValidator: () => (input) => ({ data: input as never, errorMessage: undefined, valid: true }),
};

function sortKeys(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

// Canonical JSON: object keys sorted by code unit, undefined members dropped, no whitespace.
function formatCanonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatCanonical(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .toSorted(([a], [b]) => sortKeys(a, b));
    const members = entries.map(([key, item]) => `${JSON.stringify(key)}:${formatCanonical(item)}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}

function pickPinnedFields(tool: Tool): PinnedTool {
  return {
    annotations: tool.annotations,
    description: tool.description,
    inputSchema: tool.inputSchema,
    name: tool.name,
    outputSchema: tool.outputSchema,
    title: tool.title,
  };
}

export function buildToolHash(tool: PinnedTool): string {
  return createHash('sha256').update(formatCanonical(tool)).digest('hex');
}

// A destination path such as `to` or `message.to` must name a property in the input schema.
function hasSchemaPath(schema: unknown, path: string): boolean {
  let node = schema as { properties?: Record<string, unknown> } | undefined;
  for (const part of path.split('.')) {
    const next = node?.properties?.[part];
    if (next === undefined) {
      return false;
    }
    node = next as { properties?: Record<string, unknown> };
  }
  return true;
}

export class OutsideServerProxy {
  private readonly client: Client;
  private readonly options: ProxyOptions;
  private pins: Record<string, Pin>;
  private current = new Map<string, Tool>();
  private exposed = new Map<string, string>();

  constructor(options: ProxyOptions) {
    this.options = options;
    this.pins = existsSync(options.pinsPath)
      ? (JSON.parse(readFileSync(options.pinsPath, 'utf8')) as Record<string, Pin>)
      : {};
    const validator = options.clientValidates ? undefined : passThrough;
    this.client = new Client(
      { name: 'nixie-proxy-spike', version: '0.0.0' },
      { jsonSchemaValidator: validator, versionNegotiation: { mode: 'auto' } },
    );
  }

  async start(): Promise<string | undefined> {
    const transport = new StdioClientTransport({
      args: [this.options.script ?? 'server.ts'],
      command: 'bun',
      cwd: import.meta.dir,
      env: { PATH: process.env.PATH ?? '', ...this.options.env },
    });
    await this.client.connect(transport);
    return this.client.getNegotiatedProtocolVersion();
  }

  async stop(): Promise<void> {
    await this.client.close();
  }

  // The owner reviewed the tool as the server lists it now: pin that version.
  writePin(name: string): void {
    const tool = this.current.get(name);
    if (!tool) {
      throw new Error(`the server lists no tool ${name}`);
    }
    const fields = pickPinnedFields(tool);
    this.pins[name] = { hash: buildToolHash(fields), tool: fields };
    this.writePins();
  }

  async checkTools(): Promise<ToolDecision[]> {
    const listing = await this.client.listTools();
    this.current = new Map(listing.tools.map((tool) => [tool.name, tool]));
    this.exposed.clear();
    const decisions = listing.tools.map((tool) => this.resolveDecision(tool));
    for (const name of Object.keys(this.pins)) {
      if (!this.current.has(name)) {
        delete this.pins[name];
        decisions.push({ notice: 'the server no longer lists it', status: 'removed', tool: name });
      }
    }
    this.writePins();
    return decisions;
  }

  async runTool(exposedName: string, args: Record<string, unknown>): Promise<CallOutcome> {
    const name = this.exposed.get(exposedName);
    if (!name) {
      return { error: `${exposedName} is not exposed`, source: 'outside content' };
    }
    const outputSchema = this.pins[name]?.tool.outputSchema;
    const result = await this.client.callTool({ arguments: args, name });
    const [first] = result.content;
    const text = first?.type === 'text' ? first.text : undefined;
    if (outputSchema !== undefined) {
      const validate = new AjvJsonSchemaValidator().getValidator(outputSchema as never);
      const check = validate(result.structuredContent);
      if (!check.valid) {
        const error = `result breaks the pinned outputSchema: ${check.errorMessage}`;
        return { error, source: 'outside content' };
      }
    }
    return { source: 'outside content', structured: result.structuredContent, text };
  }

  private resolveDecision(tool: Tool): ToolDecision {
    const fields = pickPinnedFields(tool);
    const hash = buildToolHash(fields);
    const pin = this.pins[tool.name];
    if (!pin) {
      return { status: 'stopped', tool: tool.name, why: 'new tool: the owner has not reviewed it' };
    }
    const changed = pin.hash !== hash;
    if (changed && this.options.trust === 'untrusted') {
      return { status: 'stopped', tool: tool.name, why: 'hash changed: waits for the owner' };
    }
    const notice = changed ? 'hash changed: applied, the server is trusted' : undefined;
    if (changed) {
      this.pins[tool.name] = { hash, tool: fields };
    }
    const declaration = this.options.declarations[tool.name];
    if (!declaration) {
      return { notice, status: 'stopped', tool: tool.name, why: 'no effect declaration' };
    }
    const missing = declaration.destinations.filter(
      (path) => !hasSchemaPath(tool.inputSchema, path),
    );
    if (missing.length > 0) {
      const why = `declared destination ${missing.join(', ')} is not in the input schema`;
      return { notice, status: 'stopped', tool: tool.name, why };
    }
    const exposedAs = `${this.options.serverId}__${tool.name}`;
    this.exposed.set(exposedAs, tool.name);
    return { exposedAs, notice, status: 'exposed', tool: tool.name };
  }

  private writePins(): void {
    writeFileSync(this.options.pinsPath, `${JSON.stringify(this.pins, undefined, 2)}\n`);
  }
}
