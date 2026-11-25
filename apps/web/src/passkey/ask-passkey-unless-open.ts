import type { ContractClient, ContractInputs } from '@heynixie/contract';
import { askPasskey } from './ask-passkey';

type ChallengeFor = ContractInputs['passkeys']['challenge']['for'];

type Assertion = NonNullable<ContractInputs['approvals']['answerProposal']['passkey']>;

// Asks the passkey for a check, unless the session's window of the last tap still covers it. The
// server decides: it never reports an open window for a check that always asks.
export async function askPasskeyUnlessOpen(
  client: ContractClient,
  binding: ChallengeFor,
): Promise<Assertion | undefined> {
  const window = await client.passkeys.window({ for: binding });

  return window.isOpen ? undefined : askPasskey(client, binding);
}
