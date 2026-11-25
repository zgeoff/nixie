import type { ContractClient, ContractInputs } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { askPasskey } from './ask-passkey';

type ChallengeFor = ContractInputs['passkeys']['challenge']['for'];

type Assertion = NonNullable<ContractInputs['approvals']['answerProposal']['passkey']>;

// Sends an answer that takes a passkey, and asks the passkey only when the session's window of the
// last tap does not cover the check. The window can lapse between the status call and the answer,
// so an answer that sent no assertion and comes back PASSKEY_REQUIRED asks once and sends again.
export async function writeWithPasskey<Result>(
  client: ContractClient,
  binding: ChallengeFor,
  write: (passkey: Assertion | undefined) => Promise<Result>,
): Promise<Result> {
  const window = await client.passkeys.window({ for: binding });

  if (!window.isOpen) {
    const assertion = await askPasskey(client, binding);

    return write(assertion);
  }

  try {
    return await write(undefined);
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'PASSKEY_REQUIRED') {
      const assertion = await askPasskey(client, binding);

      return write(assertion);
    }

    throw error;
  }
}
