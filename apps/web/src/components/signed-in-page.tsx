import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { SessionState } from '../read-session-state';
import { EnrolForm } from './enrol-form';

export interface SignedInPageProps {
  readonly session: SessionState;

  readonly onRefresh: () => void;
  readonly children: ReactNode;
}

export function SignedInPage(props: SignedInPageProps): ReactNode {
  const onRefresh = props.onRefresh;

  useEffect(() => {
    if (props.session === 'unchecked') {
      onRefresh();
    }
  }, [props.session, onRefresh]);

  if (props.session === 'unchecked') {
    return null;
  }

  if (props.session === 'none') {
    return <EnrolForm onEnrolled={onRefresh} />;
  }

  return props.children;
}
