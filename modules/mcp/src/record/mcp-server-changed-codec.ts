import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { grantBindingSchema } from './grant-binding-schema';
import type { McpRecordKind } from './mcp-record-kind';
import { serverFactsSchema } from './server-facts-schema';

const kind = 'mcp.server_changed' satisfies McpRecordKind;

// The whole row of a server after a change, which the mcp_servers projection takes as it stands.
// `facts` are the facts in use, `requested` the facts a proposal waits on, and the credential IDs
// name the server's OAuth client and grant in the credential store.
export const mcpServerChangedCodec = defineRecordCodec(
  kind,
  z.object({
    serverID: z.string(),
    cause: z.enum(['held', 'approved', 'narrowed', 'restored', 'removed', 'signed_in']),
    state: z.enum(['held', 'added', 'removed']),
    facts: serverFactsSchema.nullable(),
    requested: serverFactsSchema.nullable(),
    proposalID: z.string().nullable(),
    clientCredentialID: z.string().nullable(),
    grantCredentialID: z.string().nullable(),
    grantBinding: grantBindingSchema.nullable(),
  }),
);
