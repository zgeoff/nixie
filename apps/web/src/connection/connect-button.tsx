import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { useNixieClient } from '../utils/use-nixie-client';
import { describeConnectionError } from './describe-connection-error';
import { useActionID } from './use-action-id';

export interface ConnectButtonProps {
  // a connection's short ID to consent again, or null for a new account
  readonly connection: string | null;
  readonly label: string;
  readonly isDisabled?: boolean;
}

// Starts a consent and sends the browser to Google's page. Google sends it back to nixie's return
// route, which finishes the consent.
export function ConnectButton(props: ConnectButtonProps): ReactNode {
  const nixie = useNixieClient();
  const isHydrated = useIsHydrated();
  const action = useActionID();

  const start = useMutation({
    mutationFn: () =>
      nixie.client.connections.startConsent({
        clientActionID: action.id,
        connector: 'google',
        connection: props.connection,
      }),
    onSettled: (_result, error) => {
      action.settle(error);
    },
    onSuccess: (started) => {
      globalThis.location.assign(started.consentURL);
    },
  });

  return (
    <>
      <button
        disabled={!isHydrated || start.isPending || props.isDisabled === true}
        onClick={() => {
          start.mutate();
        }}
        type="button"
      >
        {props.label}
      </button>
      {start.isError ? <p role="alert">{describeConnectionError(start.error)}</p> : null}
    </>
  );
}
