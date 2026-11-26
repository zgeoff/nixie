import { z } from 'zod';

type RequestApproval = (operation: 'approvePackage', args: null) => Promise<unknown>;

// Approves each pending call of device.addPackage as the owner does, which a journey's browser
// cannot, because the answer takes a passkey. The server answers as its host command does, and
// returns once the package is stored. Returns how many calls it approved.
export async function approveHeldInstall(request: RequestApproval): Promise<number> {
  const approved = await request('approvePackage', null);

  return z.int().positive().parse(approved);
}
