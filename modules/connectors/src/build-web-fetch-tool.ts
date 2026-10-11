import type { ToolDefinition } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';

const webFetchInput = {
  type: 'object',
  properties: { url: { type: 'string', description: 'the https URL of the page' } },
  required: ['url'],
  additionalProperties: false,
};

// x-endorsed marks the fields whose type policy endorses as clean
const webFetchOutput = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
  },
  required: ['url', 'status', 'contentType', 'text', 'isTruncated'],
  additionalProperties: false,
};

// Builds the web fetch tool, which fetches one public HTTPS page through the fetch sandbox. It
// declares only the fetch effect and no destination, so it runs direct. Every result field is
// outside content, and only the status code and the truncated mark are endorsed types.
export function buildWebFetchTool(readPage: (url: string) => Promise<FetchReply>): ToolDefinition {
  return {
    name: 'web_fetch',
    description:
      'Fetches one public https page and returns its final URL, status code, content type and ' +
      'text: the readable text of an HTML page, the text of another text type, and no text for ' +
      'a binary type. isTruncated is true when the page passed a size limit.',
    input: webFetchInput,
    output: webFetchOutput,
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        url: 'untrusted',
        status: 'untrusted',
        contentType: 'untrusted',
        text: 'untrusted',
        isTruncated: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const reply = await readPage(String(call.input['url']));

      return reply.kind === 'page'
        ? {
            status: 'ok',
            result: {
              url: reply.url,
              status: reply.status,
              contentType: reply.contentType,
              text: reply.text,
              isTruncated: reply.isTruncated,
            },
          }
        : { status: 'error', message: reply.reason };
    },
  };
}
