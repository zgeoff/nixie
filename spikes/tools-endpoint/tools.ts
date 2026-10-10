// oxlint-disable one-var, sort-vars -- spike code, grouped for reading rather than sorted
// nixie-style tools for the spike. Each one carries nixie's own declaration in `_meta` and MCP
// annotations, so the run shows which of them reach the model. One registration serves the v1
// server, in-process and over HTTP, and the v2 server, which takes the same raw zod shapes.
import { z } from 'zod';

interface ToolConfig {
  _meta: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, z.ZodType>;
  outputSchema?: Record<string, z.ZodType>;
}

export interface ToolHost {
  registerTool: (name: string, config: ToolConfig, callback: () => unknown) => unknown;
}

export const nixieMeta = {
  'nixie/content': { price: 'outside', seller: 'outside' },
  'nixie/destinations': [],
  'nixie/effects': ['fetch'],
};

const priceOutput = {
    currency: z.string().describe('ISO 4217 code'),
    price: z.number().describe('The price in the currency'),
    seller: z.string().describe('The seller name as the page shows it'),
  },
  priceInput = { url: z.string().describe('The product page URL') },
  annotations = { openWorldHint: true, readOnlyHint: true, title: 'Look up a price' };

export function registerTools(server: ToolHost): void {
  server.registerTool(
    'price_text',
    {
      _meta: nixieMeta,
      annotations,
      description: 'Return the price on a product page, as structured content and as text.',
      inputSchema: priceInput,
      outputSchema: priceOutput,
    },
    () => {
      const result = { currency: 'EUR', price: 12.5, seller: 'Example Shop' };
      return {
        content: [{ text: `price-text-block ${JSON.stringify(result)}`, type: 'text' as const }],
        structuredContent: result,
      };
    },
  );
  server.registerTool(
    'price_bare',
    {
      _meta: nixieMeta,
      annotations,
      description: 'Return the price on a product page, as structured content only.',
      inputSchema: priceInput,
      outputSchema: priceOutput,
    },
    () => ({
      content: [],
      structuredContent: { currency: 'EUR', price: 7.25, seller: 'Bare Shop' },
    }),
  );
  server.registerTool(
    'always_fails',
    {
      _meta: { ...nixieMeta, 'nixie/effects': ['send'] },
      description: 'Send a message; this stub always refuses.',
      inputSchema: { to: z.string().describe('The recipient address') },
    },
    () => ({
      content: [{ text: 'denied by policy: rule r-17 asks before sending', type: 'text' as const }],
      isError: true,
    }),
  );
}
