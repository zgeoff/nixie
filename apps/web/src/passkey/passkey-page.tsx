import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { PasskeyAddForm } from './passkey-add-form';
import { PasskeyList } from './passkey-list';

export interface PasskeyPageProps {
  readonly navigation?: ReactNode;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });
const heading = css({ fontSize: 'lg', fontWeight: 'bold', marginTop: '4' });

// The passkeys that approve a high-risk proposal: the list, the form that adds one, and a revoke
// for each live one.
export function PasskeyPage(props: PasskeyPageProps): ReactNode {
  const nixie = useNixieClient();
  const list = useQuery(nixie.queryUtils.passkeys.list.queryOptions());
  const hasLivePasskey = list.data?.passkeys.some((passkey) => passkey.revokedAt === null) ?? false;

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Passkeys</h1>
        {props.navigation}
      </header>
      <p>
        Your passkey approves each proposal that always asks and each that lifts the always-ask set.
      </p>
      <h2 className={heading}>Your passkeys</h2>
      <PasskeyList />
      <h2 className={heading}>Add a passkey</h2>
      <PasskeyAddForm hasLivePasskey={hasLivePasskey} />
    </main>
  );
}
