import type { ToolDefinition } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';

const webFetchInput = {
  type: 'object',
  properties: { url: { type: 'string', description: 'the https URL of the page' } },
  required: ['url'],
  additionalProperties: false,
};

const webFetchOutput = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
    blocked: { type: ['string', 'null'] },
  },
  required: ['url', 'status', 'contentType', 'text', 'isTruncated', 'blocked'],
  additionalProperties: false,
};

export function buildWebFetchTool(readPage: (url: string) => Promise<FetchReply>): ToolDefinition {
  return {
    name: 'web_fetch',
    description:
      'Fetches one public https page and returns its final URL, status code, content type and ' +
      'text: the readable text of an HTML page, the text of another text type, and no text for ' +
      'a binary type. isTruncated is true when the page passed a size limit. blocked is null, ' +
      "or the reason the site's bot protection answered in place of the page, which no retry " +
      'passes.',
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
        blocked: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const input = call.input['url'];
      const url = typeof input === 'string' ? input : '';

      const reply = await readPage(url);

      return reply.kind === 'page'
        ? {
            status: 'ok',
            result: {
              url: reply.url,
              status: reply.status,
              contentType: reply.contentType,
              text: reply.text,
              isTruncated: reply.isTruncated,
              blocked: reply.blocked,
            },
          }
        : { status: 'error', message: reply.reason };
    },
  };
}
