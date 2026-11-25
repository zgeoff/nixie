import type { ReactNode } from 'react';
import type { ListedConnection } from '../types';
import { ConnectButton } from './connect-button';
import { formatMissingScope } from './format-missing-scope';

export interface MissingScopesNoticeProps {
  readonly connection: ListedConnection;
}

// Names each scope Google did not grant and the tools it holds back, with one button that asks
// Google again. The conversation never shows this notice.
export function MissingScopesNotice(props: MissingScopesNoticeProps): ReactNode {
  if (props.connection.missing.length === 0 || props.connection.status === 'forgotten') {
    return null;
  }

  return (
    <section aria-label="Missing scopes" role="status">
      <p>This connection lacks scopes, so some tools are not available.</p>
      <ul>
        {props.connection.missing.map((missing) => (
          <li key={missing.scope}>{formatMissingScope(missing)}</li>
        ))}
      </ul>
      <ConnectButton connection={props.connection.connection} label="Ask Google for them again" />
    </section>
  );
}
