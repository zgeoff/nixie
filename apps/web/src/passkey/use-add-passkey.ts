import type { ContractClient } from '@heynixie/contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';
import { askPasskey } from './ask-passkey';
import { askRegistration } from './ask-registration';
import { describePasskeyError } from './describe-passkey-error';

interface AddPasskeyInput {
  // a host code, or null to allow the new passkey with a live one
  readonly code: string | null;
  readonly label: string;
}

export interface PasskeyAdder {
  readonly add: (input: AddPasskeyInput) => void;
  readonly isPending: boolean;
  readonly message: string | null;
  readonly isAdded: boolean;
}

// Adds one passkey: a host code or a live passkey allows it, then the browser's prompt makes it.
export function useAddPasskey(): PasskeyAdder {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: AddPasskeyInput) => runAdd(nixie.client, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.passkeys.key() }),
  });

  return {
    add: (input) => {
      mutation.mutate(input);
    },
    isPending: mutation.isPending,
    isAdded: mutation.isSuccess,
    message: mutation.isError ? describePasskeyError(mutation.error) : null,
  };
}

async function runAdd(client: ContractClient, input: AddPasskeyInput): Promise<void> {
  const allowance =
    input.code === null
      ? { passkey: await askPasskey(client, { kind: 'register' }) }
      : { code: input.code };

  const issued = await client.passkeys.registrationOptions(allowance);

  const options = issued.options;

  const response = await askRegistration(options);

  const label = input.label.trim();

  await client.passkeys.register({
    clientActionID: crypto.randomUUID(),
    response,
    ...(label === '' ? {} : { label }),
  });
}
