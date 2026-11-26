import { Client } from '@modelcontextprotocol/client';
import type { jsonSchemaValidator } from '@modelcontextprotocol/client';

// The proxy checks each result against the pinned output schema itself, so the client accepts every
// result and never reads a listing's schema as a check of its own.
const acceptAnyResult: jsonSchemaValidator = {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the validator's result type is generic over the schema, and this one passes the input through
  getValidator: () => (input) => ({ valid: true, data: input as never, errorMessage: undefined }),
};

// The MCP client of one request: no sampling, roots, logging or input-request capability, and an
// input request from the server surfaces as an error, so nothing answers it for you.
export function buildClient(): Client {
  return new Client(
    { name: 'nixie', version: '0.0.0' },
    {
      jsonSchemaValidator: acceptAnyResult,
      versionNegotiation: { mode: 'auto' },
      inputRequired: { autoFulfill: false },
    },
  );
}
