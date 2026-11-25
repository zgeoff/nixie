import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ForgetBackupLine } from '../components/forget-backup-line';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { describeConnectionError } from './describe-connection-error';
import { formatForgetStatus } from './format-forget-status';
import { useActionID } from './use-action-id';

export interface ConnectionForgetProps {
  readonly connection: string;
  readonly isForgotten: boolean;
}

// Forget revokes the grant at Google and deletes the connection's keys. Afterwards the page shows
// the erasure, the revocation and the key backups apart, because each can finish on its own.
export function ConnectionForget(props: ConnectionForgetProps): ReactNode {
  if (props.isForgotten) {
    return <ForgetStatusView connection={props.connection} />;
  }

  return <ForgetAsk connection={props.connection} />;
}

const pollMs = 2000;

interface ForgetStatusViewProps {
  readonly connection: string;
}

function ForgetStatusView(props: ForgetStatusViewProps): ReactNode {
  const nixie = useNixieClient();

  const status = useQuery({
    ...nixie.queryUtils.connections.readForgetStatus.queryOptions({
      input: { connections: [props.connection] },
    }),
    refetchInterval: (query) => {
      const first = query.state.data?.[0];

      return first === undefined || first.erasure === 'pending' || first.revocation === 'pending'
        ? pollMs
        : false;
    },
  });

  if (status.isError) {
    return <p role="alert">The forget status did not load. Reload to try again.</p>;
  }

  const first = status.data?.[0];

  if (first === undefined) {
    return <p>Reading the forget status…</p>;
  }

  const lines = formatForgetStatus(first);

  return (
    <section aria-label="Forget status">
      <p>{lines.erasure}</p>
      <p>{lines.revocation}</p>
      <ForgetBackupLine backup={first.backup} />
    </section>
  );
}

const confirmation = css({ display: 'flex', flexDirection: 'column', gap: '2', maxWidth: 'md' });
const buttons = css({ display: 'flex', gap: '2' });

interface ForgetAskProps {
  readonly connection: string;
}

function ForgetAsk(props: ForgetAskProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const isHydrated = useIsHydrated();
  const action = useActionID();
  const [isAsking, setIsAsking] = useState(false);

  const forget = useMutation({
    mutationFn: () =>
      nixie.client.connections.forget({ clientActionID: action.id, connection: props.connection }),
    onSuccess: () => {
      action.renew();
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: nixie.queryUtils.connections.key() }),
  });

  if (!isAsking) {
    return (
      <button
        disabled={!isHydrated}
        onClick={() => {
          setIsAsking(true);
        }}
        type="button"
      >
        Forget this connection
      </button>
    );
  }

  return (
    <div aria-label="Forget this connection" className={confirmation} role="group">
      <p>
        Forget this connection for good? nixie revokes the grant at Google and deletes the
        connection’s keys, so its tokens are unreadable at once. Using the account again takes a
        fresh consent.
      </p>
      <div className={buttons}>
        <button
          disabled={forget.isPending}
          onClick={() => {
            forget.mutate();
          }}
          type="button"
        >
          Forget for good
        </button>
        <button
          disabled={forget.isPending}
          onClick={() => {
            setIsAsking(false);

            forget.reset();
          }}
          type="button"
        >
          Keep
        </button>
      </div>
      {forget.isError ? <p role="alert">{describeConnectionError(forget.error)}</p> : null}
    </div>
  );
}
