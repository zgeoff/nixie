import { z } from 'zod';

type RequestApproval = (operation: 'approveMcp', args: null) => Promise<unknown>;

// Approves each pending MCP server card as the owner does on the approvals page, which a journey's
// browser cannot, because the server card's answer takes a passkey. The server answers as its host
// command does. Returns how many cards it approved.
export async function approveHeldMcp(request: RequestApproval): Promise<number> {
  const approved = await request('approveMcp', null);

  return z.int().positive().parse(approved);
}
