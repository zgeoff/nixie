import type { GoogleConnections } from './start-google-connections';

// Gives a connection a grant that ends `endsInMs` from now, the way a provider's token reply does for
// a grant of limited time: the account of `code` answers with the lifetime, and a consent for the
// connection renews it. The credential store's status never changes with it: the clock alone does.
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

  if (renewed.kind !== 'finished') {
    throw new Error(`the consent that renews ${connection.short_id} ended as ${renewed.kind}`);
  }
}
