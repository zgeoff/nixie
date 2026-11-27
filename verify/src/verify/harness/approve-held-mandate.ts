import { z } from 'zod';

type RequestApproval = (operation: 'approveMandate', args: null) => Promise<unknown>;

// Approves each pending mandate card as the owner does, which a journey's browser cannot, because
// the answer takes a passkey. The server answers with the exemption that a host answer has, and no
// host command takes a mandate. Returns how many cards it approved.
export async function approveHeldMandate(request: RequestApproval): Promise<number> {
  const approved = await request('approveMandate', null);

  return z.int().positive().parse(approved);
}
