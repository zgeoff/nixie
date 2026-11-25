import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { ConnectionList } from './connection-list';
import { SetupSteps } from './setup-steps';

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const heading = css({ fontSize: 'lg', fontWeight: 'bold', marginTop: '4' });

// Settings → Connections: your Google connections, and the steps that make the first one.
export function ConnectionsPage(): ReactNode {
  return (
    <main className={layout}>
      <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Connections</h1>
      <p>Connect a Google account so nixie can reach it. nixie keeps no copy of what it reads.</p>
      <h2 className={heading}>Your connections</h2>
      <ConnectionList />
      <h2 className={heading}>Set up Google</h2>
      <SetupSteps />
    </main>
  );
}
