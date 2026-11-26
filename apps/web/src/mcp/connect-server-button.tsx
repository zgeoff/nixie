import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { useNixieClient } from '../utils/use-nixie-client';

export interface ConnectServerButtonProps {
  readonly server: string;
  readonly label: string;
}

// Starts the sign-in of one server and sends the browser to the server's page. The server sends it
// back to nixie's OAuth return route, which finishes the sign-in.
export function ConnectServerButton(props: ConnectServerButtonProps): ReactNode {
  const nixie = useNixieClient();
  const isHydrated = useIsHydrated();

  const start = useMutation({
    mutationFn: () =>
      nixie.client.mcp.connect({ server: props.server, origin: globalThis.location.origin }),
    onSuccess: (started) => {
      globalThis.location.assign(started.authorizeURL);
    },
  });

  return (
    <>
      <button
        aria-label={`${props.label} to ${props.server}`}
        disabled={!isHydrated || start.isPending}
        onClick={() => {
          start.mutate();
        }}
        type="button"
      >
        {props.label}
      </button>
      {start.isError ? (
        <p role="alert">The sign-in did not start. Check the server and try again.</p>
      ) : null}
    </>
  );
}
