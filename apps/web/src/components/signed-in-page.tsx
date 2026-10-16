import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { SessionState } from '../read-session-state';
import { EnrolForm } from './enrol-form';

export interface SignedInPageProps {
  readonly session: SessionState;

  // reads the page again, as after an enrolment or when the browser checks its own cookie
  readonly onRefresh: () => void;
  readonly children: ReactNode;
}

// Shows a page to a signed-in browser. A refused session renders the enrolment form instead of an
// error, and a refusal during the server render leaves the answer to the browser, which reads the
// page again with its own cookie.
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
