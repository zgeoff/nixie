import { grantBindingSchema } from '../record/grant-binding-schema';
import type { GrantBinding } from '../types';
import type { McpServerRow } from './mcp-tables';

// The credential fields of an `mcp.server_changed` record: the IDs of the server's OAuth client and
// grant in the credential store, and where the grant was signed in.
export interface CredentialFields {
  readonly clientCredentialID: string | null;
  readonly grantCredentialID: string | null;
  readonly grantBinding: GrantBinding | null;
}

// The fields a server row already holds, which a record that changes something else carries on.
export function toCredentialFields(row: McpServerRow | null | undefined): CredentialFields {
  if (row === null || row === undefined) {
    return { clientCredentialID: null, grantCredentialID: null, grantBinding: null };
  }

  return {
    clientCredentialID: row.client_credential_id,
    grantCredentialID: row.grant_credential_id,
    grantBinding: toGrantBinding(row),
  };
}

export function toGrantBinding(row: McpServerRow): GrantBinding | null {
  if (row.grant_binding === null) {
    return null;
  }

  return grantBindingSchema.parse(JSON.parse(row.grant_binding));
}
