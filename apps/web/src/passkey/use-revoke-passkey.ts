import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';
import { askPasskey } from './ask-passkey';
import { describePasskeyError } from './describe-passkey-error';

export interface PasskeyRevoker {
  readonly revoke: (passkeyID: string) => void;
  readonly isPending: boolean;
  readonly message: string | null;
}

// Revokes one passkey, which any live passkey must allow at its prompt, the revoked one included.
export function useRevokePasskey(): PasskeyRevoker {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (passkeyID: string) => {
      const passkey = await askPasskey(nixie.client, { kind: 'revoke', passkeyID });

      await nixie.client.passkeys.revoke({
        clientActionID: crypto.randomUUID(),
        passkeyID,
        passkey,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.passkeys.key() }),
  });

  return {
    revoke: (passkeyID) => {
      mutation.mutate(passkeyID);
    },
    isPending: mutation.isPending,
    message: mutation.isError ? describePasskeyError(mutation.error) : null,
  };
}
