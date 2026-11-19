// Prints, for each model request of each variant of a run, every part of the request body with its
// source, its UTF-8 bytes and an o200k_base token count, then a summary row per request.
//
//   bun report.ts <run_name>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base';
import { z } from 'zod';

const runName = Bun.argv[2];

if (runName === undefined) {
  throw new Error('usage: bun report.ts <run_name>');
}

const recordSchema = z.object({
  variant: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  prompt: z.string(),
  requests: z.array(
    z.object({ method: z.string(), path: z.string(), bodyBytes: z.number(), body: z.string() }),
  ),
});

type RunRecord = z.infer<typeof recordSchema>;

const messageSchema = z.object({
  type: z.literal('message'),
  role: z.string(),
  content: z.array(z.object({ type: z.string(), text: z.string() })),
});

const callOutputSchema = z.object({
  type: z.literal('function_call_output'),
  output: z.array(z.object({ type: z.string(), text: z.string() })),
});

const toolSchema = z.looseObject({
  type: z.string(),
  name: z.string(),
  tools: z.array(z.looseObject({ name: z.string() })).optional(),
});

type Source = 'nixie' | 'Codex' | 'model' | 'metadata' | 'JSON syntax';

interface Part {
  readonly part: string;
  readonly source: Source;
  readonly bytes: number;

  // null for a part the model never reads, such as client metadata
  readonly tokens: number | null;
}

// instructions is the one top-level field besides input and tools that the model reads
const modelInputFields = new Set(['instructions']);
const runDir = join(import.meta.dir, 'runs', runName);
const summaries: string[] = [];

for (const file of readdirSync(runDir).filter((name) => name.endsWith('.json')).sort()) {
  const record = recordSchema.parse(JSON.parse(readFileSync(join(runDir, file), 'utf8')));
  const modelRequests = record.requests.filter((request) => request.path.endsWith('/responses'));

  if (modelRequests.length === 0) {
    throw new Error(`${file} holds no model request`);
  }

  console.log(`\n### ${record.variant}\n\n${record.description}`);

  for (const [index, request] of modelRequests.entries()) {
    const label = `${record.variant} #${String(index + 1)}`;
    const parts = collectParts(request.body, request.bodyBytes, record);

    console.log(`\nRequest ${String(index + 1)}\n`);
    console.log(formatTable(parts));
    summaries.push(formatSummary(label, request.bodyBytes, parts));
  }
}

console.log('\n### Summary\n');
console.log(
  '| Request | Body bytes | Codex bytes the model reads | Codex tokens | nixie bytes | nixie tokens |',
);
console.log('| --- | --- | --- | --- | --- | --- |');
console.log(summaries.join('\n'));

function collectParts(body: string, bodyBytes: number, record: RunRecord): Part[] {
  const parsed = z.record(z.string(), z.unknown()).parse(JSON.parse(body));
  const parts: Part[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'input') {
      parts.push(...collectInputParts(z.array(z.unknown()).parse(value), record));
    } else if (key === 'tools') {
      parts.push(...collectToolParts(z.array(toolSchema).parse(value)));
    } else {
      parts.push(buildFieldPart(key, value));
    }
  }

  const counted = parts.reduce((sum, part) => sum + part.bytes, 0);
  const redacted = Buffer.byteLength(body);

  parts.push({
    part: 'braces, commas and keys',
    source: 'JSON syntax',
    bytes: redacted - counted,
    tokens: null,
  });

  // run.ts replaced the state folder's path in client_metadata, so the sent body was larger
  if (bodyBytes !== redacted) {
    parts.push({
      part: 'state folder path, replaced in the recorded body',
      source: 'metadata',
      bytes: bodyBytes - redacted,
      tokens: null,
    });
  }

  return parts;
}

// A message's text is the part the model reads; its type, ID and role wrapping is syntax.
function collectInputParts(items: readonly unknown[], record: RunRecord): Part[] {
  return items.flatMap((item, index) => {
    const message = messageSchema.safeParse(item);

    if (message.success) {
      const text = message.data.content.map((content) => content.text).join('');

      return [
        buildTextPart(
          `input[${index}] ${message.data.role} text`,
          pickInputSource(message.data.role, text, record),
          text,
        ),
      ];
    }

    const callOutput = callOutputSchema.safeParse(item);

    // The CLI puts its own header before the tool server's content.
    if (callOutput.success) {
      const [header, ...rest] = callOutput.data.output;

      return [
        buildTextPart(`input[${index}] tool result header`, 'Codex', header?.text ?? ''),
        buildTextPart(
          `input[${index}] tool result`,
          'nixie',
          rest.map((content) => content.text).join(''),
        ),
      ];
    }

    const json = JSON.stringify(item);
    const type = z.object({ type: z.string() }).parse(item).type;

    // a function call is the model's own earlier output, which the CLI sends back
    return [
      {
        part: `input[${index}] ${type}`,
        source: type === 'function_call' ? 'model' : 'Codex',
        bytes: Buffer.byteLength(json),
        tokens: countTokens(json),
      },
    ];
  });
}

function buildTextPart(part: string, source: Source, text: string): Part {
  return { part, source, bytes: Buffer.byteLength(JSON.stringify(text)), tokens: countTokens(text) };
}

function pickInputSource(role: string, text: string, record: RunRecord): Source {
  if (role === 'developer' && text === record.systemPrompt) {
    return 'nixie';
  }

  if (role === 'user' && text === record.prompt) {
    return 'nixie';
  }

  return 'Codex';
}

// A function at the top level is Codex's own. A namespace holds the MCP server's tools, which are
// nixie's, inside a wrapper with Codex's name and description.
function collectToolParts(tools: readonly z.infer<typeof toolSchema>[]): Part[] {
  return tools.flatMap((tool) => {
    const json = JSON.stringify(tool);

    if (tool.tools === undefined) {
      return [{ part: `tool ${tool.name}`, source: 'Codex' as const, bytes: Buffer.byteLength(json), tokens: countTokens(json) }];
    }

    const members = tool.tools.map((member) => {
      const memberJSON = JSON.stringify(member);

      return { part: `tool ${tool.name}.${member.name}`, source: 'nixie' as const, bytes: Buffer.byteLength(memberJSON), tokens: countTokens(memberJSON) };
    });
    const wrapper = JSON.stringify({ ...tool, tools: [] });

    return [
      { part: `tool ${tool.name} wrapper`, source: 'Codex' as const, bytes: Buffer.byteLength(wrapper), tokens: countTokens(wrapper) },
      ...members,
    ];
  });
}

function buildFieldPart(key: string, value: unknown): Part {
  const json = JSON.stringify(value);
  const isModelInput = modelInputFields.has(key);

  return {
    part: key,
    source: isModelInput ? 'Codex' : 'metadata',
    bytes: Buffer.byteLength(json),
    tokens: isModelInput ? countTokens(json) : null,
  };
}

function formatTable(parts: readonly Part[]): string {
  const rows = parts.map(
    (part) => `| ${part.part} | ${part.source} | ${part.bytes} | ${part.tokens ?? '-'} |`,
  );

  return ['| Part | Source | Bytes | Tokens |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

function formatSummary(label: string, bodyBytes: number, parts: readonly Part[]): string {
  const codex = parts.filter((part) => part.source === 'Codex');
  const nixie = parts.filter((part) => part.source === 'nixie');
  const sum = (picked: readonly Part[], field: 'bytes' | 'tokens') =>
    picked.reduce((total, part) => total + (part[field] ?? 0), 0);

  return `| ${label} | ${bodyBytes} | ${sum(codex, 'bytes')} | ${sum(codex, 'tokens')} | ${sum(nixie, 'bytes')} | ${sum(nixie, 'tokens')} |`;
}
