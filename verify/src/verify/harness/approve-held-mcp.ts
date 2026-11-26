import { z } from 'zod';

export type McpApprovalLabel = 'Add the server' | 'Allow the tool';

interface McpApprovalArgs {
  readonly change: 'server' | 'tool';
}

type RequestApproval = (operation: 'approveMcp', args: McpApprovalArgs) => Promise<unknown>;

// Approves each pending MCP card with the label as the owner does on the approvals page, which a
// journey's browser cannot, because the server card's answer takes a passkey. The server answers as
// its host command does. Returns how many cards it approved.
export async function approveHeldMcp(
  request: RequestApproval,
  label: McpApprovalLabel,
): Promise<number> {
  const approved = await request('approveMcp', {
    change: label === 'Add the server' ? 'server' : 'tool',
  });

  return z.int().positive().parse(approved);
}
