// A 2025-era outside server on the v1 SDK, which knows no `server/discover`.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'stand-in-v1', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      description: 'Look up a note by its ID.',
      inputSchema: { properties: { id: { type: 'string' } }, required: ['id'], type: 'object' },
      name: 'lookup_note',
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, (request) => ({
  content: [
    { text: `lookup_note ran with ${JSON.stringify(request.params.arguments)}`, type: 'text' },
  ],
}));

await server.connect(new StdioServerTransport());
