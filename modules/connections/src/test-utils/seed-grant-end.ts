import type { GoogleConnections } from './start-google-connections';

// Gives a connection a grant that ends `endsInMs` from now, through one consent that renews it, then
// lets the account of `code` answer as before, so a later consent gives its first grant again. The
// credential store's status never changes with it: the clock alone does.
interface RenewedConnection {
  readonly short_id: string;
}

export async function seedGrantEnd(
  harness: Pick<GoogleConnections, 'google' | 'connect'>,
  connection: RenewedConnection,
  code: string,
  endsInMs: number,
): Promise<void> {
  const account = harness.google.accounts.get(code);

  if (account === undefined) {
    throw new Error(`the fake Google knows no account for the code ${code}`);
  }

  harness.google.accounts.set(code, { ...account, refreshExpiresInSeconds: endsInMs / 1000 });

  const renewed = await harness.connect(code, connection.short_id);

  harness.google.accounts.set(code, account);

  if (renewed.kind !== 'finished') {
    throw new Error(`the consent that renews ${connection.short_id} ended as ${renewed.kind}`);
  }
}
