import type { JSONObject } from '@heynixie/log';
import { mintBlockID, renderFenced } from '@heynixie/wire';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { ToolImage } from '../types';
import type { Settled } from './types';

export function toCallToolResult(settled: Settled): CallToolResult {
  const reply = settled.reply;

  if (reply.kind === 'text') {
    const text = reply.isOutside === true ? renderFencedText(reply.text) : reply.text;

    return { content: [{ type: 'text', text }], isError: reply.isError };
  }

  // The Claude Code CLI ends its turn after a result with this key and makes no further model call.
  const endTurn = settled.endsTurn === true ? { _meta: { 'claude/endTurn': true } } : {};
  const isError = reply.isError === true ? { isError: true } : {};

  // Outside text reaches the model inside the one fence, and never as structured content.
  if (isUntrustedResult(settled)) {
    return {
      content: [
        { type: 'text', text: renderFencedResult(reply.result) },
        ...reply.images.map(toImageBlock),
      ],
      ...isError,
      ...endTurn,
    };
  }

  if (reply.images.length === 0) {
    return { content: [], structuredContent: reply.result, ...isError, ...endTurn };
  }

  return {
    content: [
      { type: 'text', text: JSON.stringify(reply.result) },
      ...reply.images.map(toImageBlock),
    ],
    ...isError,
    ...endTurn,
  };
}

function renderFencedText(text: string): string {
  return renderFenced({
    tag: 'tool-result',
    attributes: { source: 'untrusted' },
    text,
    fence: mintBlockID(),
  });
}

// A result is outside text when every one of its fields is untrusted. A result that mixes sources
// reaches the model as it is, and its tool marks its own outside fields.
function isUntrustedResult(settled: Settled): boolean {
  const sources = Object.values(settled.sources);

  return sources.every((source) => source === 'untrusted');
}

// A result of one text field reads as that text, and any other result as its JSON.
function renderFencedResult(result: JSONObject): string {
  const keys = Object.keys(result);
  const text = result['text'];
  const body = keys.length === 1 && typeof text === 'string' ? text : JSON.stringify(result);

  return renderFencedText(body);
}

function toImageBlock(image: ToolImage) {
  return {
    type: 'image' as const,
    data: Buffer.from(image.bytes).toString('base64'),
    mimeType: image.mediaType,
  };
}
