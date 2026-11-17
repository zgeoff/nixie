import { buildProviderOrder } from '@heynixie/wire';
import { z } from 'zod';

export type RewriteResult =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly error: string };

export interface RewriteRule {
  // the frame's model, which a refusal names
  readonly model: string;
  readonly systemPrompt: string;
  readonly providerPin: string | null;
}

const bodySchema = z.record(z.string(), z.unknown());
const systemSchema = z.array(z.looseObject({ type: z.literal('text'), text: z.string() }));

export function rewriteModelRequest(
  endpoint: 'messages' | 'count_tokens',
  body: string,
  rule: RewriteRule,
): RewriteResult {
  const prefix = `nixie refused a model request to ${rule.model}:`;
  const parsed = bodySchema.safeParse(parseJSON(body));
  const system = systemSchema.safeParse(parsed.data?.['system']);

  if (!parsed.success || !system.success) {
    return {
      ok: false,
      error: `${prefix} its system prompt is not a list of text blocks, so nixie cannot show that the CLI's blocks are gone`,
    };
  }

  const blocks = system.data;

  const start = findTailStart(
    blocks.map((block) => block.text),
    rule.systemPrompt,
  );

  if (start === null) {
    return {
      ok: false,
      error: `${prefix} no tail of its ${String(blocks.length)} system blocks equals nixie's system prompt, so nixie cannot show that the CLI's blocks are gone`,
    };
  }

  const providerOrder =
    endpoint === 'messages' && rule.providerPin !== null
      ? buildProviderOrder(rule.providerPin)
      : {};

  return {
    ok: true,
    body: JSON.stringify({ ...parsed.data, system: blocks.slice(start), ...providerOrder }),
  };
}

function parseJSON(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// The CLI's own blocks come ahead of nixie's system prompt, which is the shortest run of blocks at
// the end of the list whose text, joined, equals it. The system blocks probe shows the CLI sends a
// custom prompt as one block, so the separator never joins two blocks today.
const blockSeparator = '\n\n';

function findTailStart(texts: readonly string[], prompt: string): number | null {
  for (let start = texts.length - 1; start >= 0; start -= 1) {
    if (texts.slice(start).join(blockSeparator) === prompt) {
      return start;
    }
  }

  return null;
}
